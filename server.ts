import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { connectToMongoDB, getDB } from "./src/server/db.js";
import { getUsersCollection, getAlertsCollection } from "./src/server/models.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Connect to MongoDB
  try {
    await connectToMongoDB();
  } catch (error) {
    console.warn('MongoDB connection failed. Running without database:', error);
  }

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ==================== SEND SMS ALERT ====================
  app.post("/api/send-alert/sms", async (req, res) => {
    try {
      const { contact1, contact2, userName, mapLink } = req.body;

      if (!contact1) {
        return res.status(400).json({ success: false, error: 'No contact provided' });
      }

      const message = `🚨 SAAHAS ALERT: ${userName} may be in danger!\nLocation: ${mapLink}\nReply YES if you can help, NO if unavailable.`;
      const contacts = [contact1];
      if (contact2) contacts.push(contact2);

      const results = [];

      for (const contact of contacts) {
        try {
          console.log(`📱 [MOCK] SMS to ${contact}: ${message}`);
          results.push({ contact, status: 'mocked', note: 'Mock UI only' });
        } catch (error) {
          console.error(`❌ Failed to send SMS to ${contact}:`, error);
          results.push({ contact, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      res.json({ success: true, results });
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
      const contacts = [contact1];
      if (contact2) contacts.push(contact2);

      const results = [];

      for (const contact of contacts) {
        try {
          console.log(`💬 [PENDING] WhatsApp to ${contact}: ${message}`);
          // TODO: Implement CallMeBot WhatsApp integration
          results.push({ contact, status: 'pending', note: 'CallMeBot WhatsApp integration in progress' });
        } catch (error) {
          console.error(`❌ Failed to send WhatsApp to ${contact}:`, error);
          results.push({ contact, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error('Error sending WhatsApp alerts:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ==================== FIRE COMBINED ALERT (SMS + WhatsApp) ====================
  app.post("/api/fire-alert", async (req, res) => {
    try {
      const { walkId, userId, contact1, contact2, userName, lastLocation } = req.body;

      if (!contact1 || !lastLocation) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const mapLink = `https://maps.google.com/?q=${lastLocation.lat},${lastLocation.lng}`;

      console.log(`\n🚨 ======== ALERT FIRED FOR ${userName.toUpperCase()} ======== 🚨`);
      console.log(`📱 Sending SMS to emergency contacts...`);
      console.log(`💬 Sending WhatsApp to emergency contacts...`);

      // Send SMS
      const smsResponse = await fetch(`http://localhost:${PORT}/api/send-alert/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact1, contact2, userName, mapLink })
      }).then(r => r.json());

      // Send WhatsApp
      const whatsappResponse = await fetch(`http://localhost:${PORT}/api/send-alert/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact1, contact2, userName, mapLink })
      }).then(r => r.json());

      console.log(`\n✅ Alert notifications sent!\n`);

      res.json({
        success: true,
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
