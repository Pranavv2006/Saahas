import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import twilio from "twilio";
import { connectToMongoDB, getDB } from "./src/server/db.js";
import { getUsersCollection, getAlertsCollection } from "./src/server/models.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const notifiedWalkStarts = new Set<string>();
const notifiedWalkEvents = new Set<string>();

type DeliveryResult = {
  contact: string;
  status: "sent" | "failed";
  sid?: string;
  error?: string;
};

const normalizePhone = (phone: unknown) => {
  let digits = String(phone ?? "").replace(/\D/g, "");
  const defaultCountryCode = (process.env.TWILIO_DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "");

  if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = `${defaultCountryCode}${digits}`;
  }
  if (digits.length < 11 || digits.length > 15) {
    throw new Error(`Invalid phone number: ${String(phone ?? "")}`);
  }

  return `+${digits}`;
};

const getContacts = (contact1: unknown, contact2: unknown) => {
  return [...new Set([contact1, contact2].filter(Boolean).map(normalizePhone))];
};

const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local.");
  }

  return twilio(accountSid, authToken);
};

const sendTwilioMessages = async (
  contacts: string[],
  message: string,
  from: string,
  channel: "sms" | "whatsapp",
) => {
  const client = getTwilioClient();
  const results = await Promise.allSettled(
    contacts.map(async (contact): Promise<DeliveryResult> => {
      const to = channel === "whatsapp" ? `whatsapp:${contact}` : contact;
      const sentMessage = await client.messages.create({ body: message, from, to });
      return { contact, status: "sent", sid: sentMessage.sid };
    }),
  );

  const deliveries: DeliveryResult[] = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const error = result.reason instanceof Error ? result.reason.message : "Unknown Twilio error";
    console.error(`Twilio ${channel} delivery to ${contacts[index]} failed:`, error);
    return { contact: contacts[index], status: "failed", error };
  });

  return {
    success: deliveries.every((delivery) => delivery.status === "sent"),
    results: deliveries,
  };
};

async function startServer() {
  // Connect to MongoDB
  try {
    await connectToMongoDB();
  } catch (error) {
    console.warn('MongoDB connection failed. Running without database:', error);
  }

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // ==================== SEND SMS ALERT ====================
  app.post("/api/send-alert/sms", async (req, res) => {
    try {
      const { contact1, contact2, userName, mapLink } = req.body;

      if (!contact1) {
        return res.status(400).json({ success: false, error: 'No contact provided' });
      }

      const message = `🚨 SAAHAS ALERT: ${userName} may be in danger!\nLocation: ${mapLink}\nReply YES if you can help, NO if unavailable.`;
      const smsFrom = process.env.TWILIO_SMS_FROM;
      if (!smsFrom) {
        return res.json({
          success: false,
          skipped: true,
          error: "SMS is not configured. Set TWILIO_SMS_FROM to an SMS-capable Twilio number.",
        });
      }

      const result = await sendTwilioMessages(getContacts(contact1, contact2), message, normalizePhone(smsFrom), "sms");
      res.status(result.success ? 200 : 502).json(result);
    } catch (error) {
      console.error('Error sending SMS alerts:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ==================== SEND WHATSAPP ALERT ====================
  app.post("/api/send-alert/whatsapp", async (req, res) => {
    try {
      const { contact1, contact2, userName, mapLink } = req.body;

      if (!contact1) {
        return res.status(400).json({ success: false, error: 'No contact provided' });
      }

      const message = `🚨 *SAAHAS ALERT* 🚨\n\n${userName} may be in danger!\n\n📍 Location: ${mapLink}\n\nReply:\n✅ YES - I can help\n❌ NO - I'm unavailable`;
      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
      if (!whatsappFrom) {
        return res.status(503).json({
          success: false,
          error: "WhatsApp is not configured. Set TWILIO_WHATSAPP_FROM in .env.local.",
        });
      }

      const normalizedFrom = `whatsapp:${normalizePhone(whatsappFrom)}`;
      const result = await sendTwilioMessages(getContacts(contact1, contact2), message, normalizedFrom, "whatsapp");
      res.status(result.success ? 200 : 502).json(result);
    } catch (error) {
      console.error('Error sending WhatsApp alerts:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ==================== NOTIFY CONTACTS WHEN A WALK STARTS ====================
  app.post("/api/notify-walk-start", async (req, res) => {
    try {
      const { walkId, contact1, contact2, userName, durationMinutes, location } = req.body;
      const lat = Number(location?.lat);
      const lng = Number(location?.lng);

      if (!walkId || !contact1 || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({
          success: false,
          error: "walkId, contact1, and valid starting coordinates are required.",
        });
      }

      if (notifiedWalkStarts.has(String(walkId))) {
        return res.json({ success: true, duplicate: true, results: [] });
      }

      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
      if (!whatsappFrom) {
        return res.status(503).json({
          success: false,
          error: "WhatsApp is not configured. Set TWILIO_WHATSAPP_FROM in .env.local.",
        });
      }

      const safeName = String(userName || "The Saahas user").trim();
      const duration = Math.max(1, Number(durationMinutes) || 1);
      const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
      const message = `🚶 *Saahas Walk Started*\n\nThis is an automated safety notification.\n\n${safeName} has started a monitored walk.\n\n📍 Starting coordinates:\nLatitude: ${lat}\nLongitude: ${lng}\n${mapLink}\n\nExpected duration: ${duration} minutes.\nWalk ID: ${walkId}\n\n— Sent via Saahas Safety App`;
      const result = await sendTwilioMessages(
        getContacts(contact1, contact2),
        message,
        `whatsapp:${normalizePhone(whatsappFrom)}`,
        "whatsapp",
      );

      if (result.success) notifiedWalkStarts.add(String(walkId));
      res.status(result.success ? 200 : 502).json(result);
    } catch (error) {
      console.error("Walk-start WhatsApp notification failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ==================== SAFE ARRIVAL / SOS / OVERDUE NOTIFICATIONS ====================
  app.post("/api/notify-walk-event", async (req, res) => {
    try {
      const { eventType, walkId, contact1, contact2, userName, location } = req.body;
      const supportedEvents = new Set(["safe-arrival", "triple-tap", "overdue"]);
      const lat = Number(location?.lat);
      const lng = Number(location?.lng);

      if (!supportedEvents.has(eventType) || !walkId || !contact1 || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({
          success: false,
          error: "A valid eventType, walkId, contact1, and current coordinates are required.",
        });
      }

      const eventKey = `${walkId}:${eventType}`;
      if (notifiedWalkEvents.has(eventKey)) {
        return res.json({ success: true, duplicate: true, results: [] });
      }

      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
      if (!whatsappFrom) {
        return res.status(503).json({ success: false, error: "TWILIO_WHATSAPP_FROM is not configured." });
      }

      const safeName = String(userName || "The Saahas user").trim();
      const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
      const eventCopy = {
        "safe-arrival": {
          title: "✅ *Saahas Safe Arrival*",
          detail: `${safeName} has ended the monitored walk and confirmed a safe arrival.`,
          action: "No emergency action is required.",
        },
        "triple-tap": {
          title: "🚨 *Saahas Triple-Tap SOS*",
          detail: `${safeName} triple-tapped the walk timer and may need immediate assistance.`,
          action: `Please contact ${safeName} immediately and check the location below.`,
        },
        overdue: {
          title: "🚨 *Saahas Walk Overdue*",
          detail: `${safeName} did not confirm a safe arrival before the walk timer and grace period ended.`,
          action: `Please contact ${safeName} immediately and check the location below.`,
        },
      }[eventType as "safe-arrival" | "triple-tap" | "overdue"];

      const message = `${eventCopy.title}\n\n${eventCopy.detail}\n\n${eventCopy.action}\n\n📍 Latest coordinates:\nLatitude: ${lat}\nLongitude: ${lng}\n${mapLink}\n\nWalk ID: ${walkId}\n\n— Sent via Saahas Safety App`;
      const result = await sendTwilioMessages(
        getContacts(contact1, contact2),
        message,
        `whatsapp:${normalizePhone(whatsappFrom)}`,
        "whatsapp",
      );

      if (result.success) notifiedWalkEvents.add(eventKey);
      res.status(result.success ? 200 : 502).json(result);
    } catch (error) {
      console.error("Walk-event WhatsApp notification failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ==================== FIRE COMBINED ALERT (SMS + WhatsApp) ====================
  app.post("/api/fire-alert", async (req, res) => {
    try {
      const { contact1, contact2, userName, lastLocation, reason } = req.body;

      if (!contact1 || !lastLocation) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const mapLink = `https://maps.google.com/?q=${lastLocation.lat},${lastLocation.lng}`;

      console.log(`\n🚨 ======== ALERT FIRED FOR ${String(userName || "USER").toUpperCase()} ======== 🚨`);
      console.log(`📱 Sending SMS to emergency contacts...`);
      console.log(`💬 Sending WhatsApp to emergency contacts...`);

      // Send SMS
      const contacts = getContacts(contact1, contact2);
      const smsMessage = `🚨 SAAHAS ALERT: ${userName} may be in danger!\nLocation: ${mapLink}\nReply YES if you can help, NO if unavailable.`;
      const smsFrom = process.env.TWILIO_SMS_FROM;
      const smsResponse = smsFrom
        ? await sendTwilioMessages(contacts, smsMessage, normalizePhone(smsFrom), "sms")
        : { success: false, skipped: true, error: "TWILIO_SMS_FROM is not configured." };

      // Send WhatsApp
      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
      if (!whatsappFrom) {
        throw new Error("TWILIO_WHATSAPP_FROM is not configured.");
      }
      const reasonLine = reason ? `\nReason: ${String(reason)}\n` : "";
      const whatsappMessage = `🚨 *SAAHAS ALERT* 🚨\n\n${userName} may be in danger!${reasonLine}\n📍 Location: ${mapLink}\n\nReply:\n✅ YES - I can help\n❌ NO - I'm unavailable`;
      const whatsappResponse = await sendTwilioMessages(
        contacts,
        whatsappMessage,
        `whatsapp:${normalizePhone(whatsappFrom)}`,
        "whatsapp",
      );

      console.log(`\n✅ Alert notifications sent!\n`);

      const success = whatsappResponse.success || smsResponse.success;
      res.status(success ? 200 : 502).json({
        success,
        sms: smsResponse,
        whatsapp: whatsappResponse
      });
    } catch (error) {
      console.error('Error firing alert:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ==================== USER PROFILE ENDPOINTS ====================

  // Create a new user profile
  app.post("/api/users", async (req, res) => {
    try {
      const { userId, name, phone, emergency_contact_1, emergency_contact_2, cancel_pin, preset_message, address, checkin_interval } = req.body;

      // Validate required fields
      if (!userId || !name || !phone || !cancel_pin) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const db = getDB();
      const usersCollection = getUsersCollection(db);

      const userProfile = {
        userId,
        name,
        phone,
        emergency_contact_1: emergency_contact_1 || '',
        emergency_contact_2: emergency_contact_2 || '',
        cancel_pin,
        preset_message: preset_message || 'I may be in danger. Last location:',
        address: address || '',
        checkin_interval: checkin_interval || 5,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await usersCollection.insertOne(userProfile);
      console.log(`✅ User profile created: ${userId}`);
      res.json({ success: true, userId, id: result.insertedId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate')) {
        return res.status(409).json({ success: false, error: 'User already exists' });
      }
      console.error('Error creating user profile:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get user profile
  app.get("/api/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const db = getDB();
      const usersCollection = getUsersCollection(db);

      const userProfile = await usersCollection.findOne({ userId });
      if (!userProfile) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true, data: userProfile });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update user profile
  app.put("/api/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;

      // Remove userId and timestamps from update data
      delete updateData.userId;
      delete updateData._id;
      delete updateData.createdAt;

      const db = getDB();
      const usersCollection = getUsersCollection(db);

      const result = await usersCollection.updateOne(
        { userId },
        {
          $set: {
            ...updateData,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      console.log(`✅ User profile updated: ${userId}`);
      res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete user profile
  app.delete("/api/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const db = getDB();
      const usersCollection = getUsersCollection(db);

      const result = await usersCollection.deleteOne({ userId });

      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      console.log(`✅ User profile deleted: ${userId}`);
      res.json({ success: true, message: 'Profile deleted successfully' });
    } catch (error) {
      console.error('Error deleting user profile:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ==================== ALERT ENDPOINTS ====================

  // Create/Start an alert
  app.post("/api/alerts", async (req, res) => {
    try {
      const { walkId, userId, location, status, lastLocation, reason } = req.body;

      if (!walkId || !userId) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const db = getDB();
      const alertsCollection = getAlertsCollection(db);

      const alert = {
        walkId,
        userId,
        status: status || 'active',
        shadowModeActive: status !== 'emergency',
        location: location || lastLocation || null,
        reason: reason || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await alertsCollection.insertOne(alert);
      
      if (reason === 'app-closed' || reason === 'app-backgrounded') {
        console.log(`🚨 EMERGENCY ALERT: ${reason.toUpperCase()} - User ${userId} - Last location: ${lastLocation?.lat}, ${lastLocation?.lng}`);
      } else {
        console.log(`🚨 Alert created: ${walkId} for user ${userId}`);
      }
      
      res.json({ success: true, alertId: result.insertedId });
    } catch (error) {
      console.error('Error creating alert:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Cancel an alert
  app.post("/api/cancel-alert", async (req, res) => {
    const { walkId, userId } = req.body;
    console.log(`Cancelling alert for walkId: ${walkId}`);

    try {
      const db = getDB();
      const alertsCollection = getAlertsCollection(db);
      
      const result = await alertsCollection.updateOne(
        { walkId },
        { 
          $set: { 
            status: 'cancelled', 
            shadowModeActive: false,
            updatedAt: new Date()
          } 
        },
        { upsert: true }
      );

      // In a real app, we'd send SMS here
      console.log(`✅ SAAHAS UPDATE: User confirmed they are safe. No further action is needed. Thank you for being there.`);

      res.json({ success: true, acknowledged: result.acknowledged });
    } catch (error) {
      console.error('Error cancelling alert:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get alert details
  app.get("/api/alerts/:walkId", async (req, res) => {
    try {
      const { walkId } = req.params;
      const db = getDB();
      const alertsCollection = getAlertsCollection(db);

      const alert = await alertsCollection.findOne({ walkId });
      if (!alert) {
        return res.status(404).json({ success: false, error: 'Alert not found' });
      }

      res.json({ success: true, data: alert });
    } catch (error) {
      console.error('Error fetching alert:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get all alerts for a user
  app.get("/api/users/:userId/alerts", async (req, res) => {
    try {
      const { userId } = req.params;
      const db = getDB();
      const alertsCollection = getAlertsCollection(db);

      const alerts = await alertsCollection.find({ userId }).toArray();
      res.json({ success: true, data: alerts });
    } catch (error) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ==================== VITE MIDDLEWARE ====================

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
