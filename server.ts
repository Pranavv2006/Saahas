import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import Twilio from "twilio";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/saahas";
const mongoClient = new MongoClient(mongoUri);

type NormalizedEmergencyContact = {
  name: string;
  phone: string;
};

type AlertLocation = {
  lat: number;
  lng: number;
  updatedAt: number;
  label?: string;
};

type ActiveAlertRecord = {
  walkId: string;
  userName: string;
  userPhone: string;
  alertReason: string;
  status: "waiting_ack" | "acknowledged" | "shadow_active" | "cancelled";
  shadowModeActive: boolean;
  automaticSosTriggered: boolean;
  emergencyContacts: NormalizedEmergencyContact[];
  latestLocation: AlertLocation | null;
  createdAt: number;
  ackDeadlineAt: number;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  nearbyUsersNotified: number;
  nearbyUsers: string[];
  messageSidByContact: Record<string, string>;
  timer: NodeJS.Timeout | null;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  const normalizeStoredPhone = (phone: string) => {
    let digits = String(phone ?? "").replace(/\D/g, "");

    if (digits.startsWith("0") && digits.length === 11) {
      digits = digits.slice(1);
    }

    if (digits.length === 10) {
      digits = `91${digits}`;
    }

    return digits;
  };

  const normalizeWhatsAppPhone = (phone: string) => {
    return `whatsapp:+${normalizeStoredPhone(phone)}`;
  };

  const normalizeEmergencyContacts = (emergencyContacts: unknown) => {
    if (!Array.isArray(emergencyContacts)) {
      return [];
    }

    return emergencyContacts
      .map((contact, index) => {
        const rawName = typeof contact === "object" && contact !== null && "name" in contact
          ? String((contact as { name?: unknown }).name ?? "").trim()
          : "";
        const rawPhone = typeof contact === "object" && contact !== null && "phone" in contact
          ? String((contact as { phone?: unknown }).phone ?? "")
          : "";
        const normalizedPhone = normalizeStoredPhone(rawPhone);

        if (!normalizedPhone) {
          return null;
        }

        return {
          name: rawName || `Emergency Contact ${index + 1}`,
          phone: normalizedPhone,
        };
      })
      .filter((contact): contact is { name: string; phone: string } => contact !== null);
  };

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  await mongoClient.connect();
  const db = mongoClient.db();
  const profilesCollection = db.collection("profiles");
  await profilesCollection.createIndex({ phone: 1 }, { unique: true });

  const activeAlerts: Record<string, ActiveAlertRecord> = {};

  const getTwilioConfig = () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !whatsappFrom) {
      throw new Error("Missing Twilio WhatsApp environment variables.");
    }

    return {
      twilioClient: Twilio(accountSid, authToken),
      whatsappFrom,
    };
  };

  const toFiniteNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const buildMapsLink = (location: AlertLocation | null) => {
    if (!location) {
      return "Unavailable";
    }

    return `https://maps.google.com/?q=${location.lat},${location.lng}`;
  };

  const haversineDistanceKm = (a: AlertLocation, b: AlertLocation) => {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);

    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const aVal = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    return earthRadiusKm * c;
  };

  const clearAlertTimer = (walkId: string) => {
    const activeAlert = activeAlerts[walkId];
    if (activeAlert?.timer) {
      clearTimeout(activeAlert.timer);
      activeAlert.timer = null;
    }
  };

  const sendWhatsAppMessages = async (contacts: NormalizedEmergencyContact[], body: string) => {
    const { twilioClient, whatsappFrom } = getTwilioConfig();

    return Promise.allSettled(
      contacts.map((contact) => {
        return twilioClient.messages.create({
          from: whatsappFrom,
          to: normalizeWhatsAppPhone(contact.phone),
          body,
        });
      }),
    );
  };

  const activateShadowMode = async (walkId: string) => {
    const activeAlert = activeAlerts[walkId];

    if (!activeAlert || activeAlert.status !== "waiting_ack") {
      return;
    }

    clearAlertTimer(walkId);
    activeAlert.status = "shadow_active";
    activeAlert.shadowModeActive = true;
    activeAlert.automaticSosTriggered = true;

    if (!activeAlert.latestLocation) {
      console.warn("Shadow mode activation skipped nearby-user lookup because no location was available.", { walkId });
      return;
    }

    const profiles = await profilesCollection.find({
      phone: { $ne: activeAlert.userPhone },
      "lastKnownLocation.lat": { $exists: true },
      "lastKnownLocation.lng": { $exists: true },
    }).toArray();

    const emergencyPhones = new Set(activeAlert.emergencyContacts.map((contact) => contact.phone));
    const nearbyUsers = profiles
      .map((profile) => {
        const lat = toFiniteNumber((profile as { lastKnownLocation?: { lat?: unknown } }).lastKnownLocation?.lat);
        const lng = toFiniteNumber((profile as { lastKnownLocation?: { lng?: unknown } }).lastKnownLocation?.lng);

        if (lat === null || lng === null) {
          return null;
        }

        const profileLocation: AlertLocation = {
          lat,
          lng,
          updatedAt: Date.now(),
        };
        const distanceKm = haversineDistanceKm(activeAlert.latestLocation as AlertLocation, profileLocation);
        const phone = normalizeStoredPhone(String((profile as { phone?: string }).phone ?? ""));

        if (!phone || emergencyPhones.has(phone) || distanceKm > 2) {
          return null;
        }

        return {
          name: String((profile as { fullName?: string }).fullName ?? "").trim() || "Saahas User",
          phone,
        };
      })
      .filter((user): user is NormalizedEmergencyContact => user !== null);

    if (nearbyUsers.length === 0) {
      activeAlert.nearbyUsersNotified = 0;
      activeAlert.nearbyUsers = [];
      return;
    }

    activeAlert.nearbyUsersNotified = nearbyUsers.length;
    activeAlert.nearbyUsers = nearbyUsers.map((user) => user.phone);

    const anonymousAlertMessage = `🚨 SAAHAS SHADOW MODE ALERT

Someone nearby may be in danger.

Approximate live location:
${buildMapsLink(activeAlert.latestLocation)}

Please keep watch from a safe distance and call emergency services immediately if needed.

Walk ID: ${walkId}

— Sent via Saahas Safety App`;

    const results = await sendWhatsAppMessages(nearbyUsers, anonymousAlertMessage);
    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length > 0) {
      console.warn("Some shadow mode notifications failed:", {
        walkId,
        failures: failures.length,
      });
    }
  };

  const scheduleAlertEscalation = (walkId: string) => {
    clearAlertTimer(walkId);

    const activeAlert = activeAlerts[walkId];
    if (!activeAlert) {
      return;
    }

    activeAlert.timer = setTimeout(() => {
      void activateShadowMode(walkId).catch((error) => {
        console.error("Shadow mode activation failed:", error);
      });
    }, 60000);
  };

  const findLatestPendingAlertForPhone = (phone: string) => {
    return Object.values(activeAlerts)
      .filter((alert) => alert.status === "waiting_ack" && alert.emergencyContacts.some((contact) => contact.phone === phone))
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  };

  // API routes
  app.post("/api/profile/register", async (req, res) => {
    try {
      const {
        fullName,
        phone,
        homeAddress,
        contact1Name,
        contact1Phone,
        contact1Role,
        contact2Name,
        contact2Phone,
        contact2Role,
        guardianName,
        alertMessage,
        defaultDuration,
        pin,
      } = req.body;

      const normalizedPhone = normalizeStoredPhone(phone);
      const normalizedPin = String(pin ?? "").replace(/\D/g, "").slice(0, 4);

      if (!normalizedPhone) {
        throw new Error("Phone number is required.");
      }

      if (normalizedPin.length !== 4) {
        throw new Error("A valid 4-digit PIN is required.");
      }

      await profilesCollection.updateOne(
        { phone: normalizedPhone },
        {
          $set: {
            fullName: fullName ?? "",
            phone: normalizedPhone,
            homeAddress: homeAddress ?? "",
            contact1Name: contact1Name ?? "",
            contact1Phone: normalizeStoredPhone(contact1Phone ?? ""),
            contact1Role: contact1Role ?? "Family",
            contact2Name: contact2Name ?? "",
            contact2Phone: normalizeStoredPhone(contact2Phone ?? ""),
            contact2Role: contact2Role ?? "Friend",
            guardianName: guardianName ?? "Mom",
            alertMessage: alertMessage ?? "I may be in danger. My last known location:",
            defaultDuration: Number(defaultDuration ?? 10),
            pin: normalizedPin,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Profile register failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/profile/login", async (req, res) => {
    try {
      const normalizedPhone = normalizeStoredPhone(req.body.phone);
      const normalizedPin = String(req.body.pin ?? "").replace(/\D/g, "").slice(0, 4);

      if (!normalizedPhone || normalizedPin.length !== 4) {
        throw new Error("Phone number and 4-digit PIN are required.");
      }

      const profile = await profilesCollection.findOne({ phone: normalizedPhone });

      if (!profile) {
        return res.status(404).json({ success: false, error: "Profile not found." });
      }

      if (profile.pin !== normalizedPin) {
        return res.status(401).json({ success: false, error: "Invalid phone or PIN." });
      }

      res.json({
        success: true,
        profile: {
          fullName: profile.fullName ?? "",
          phone: profile.phone ?? "",
          homeAddress: profile.homeAddress ?? "",
          avatar: profile.avatar ?? "👤",
          contact1Name: profile.contact1Name ?? "",
          contact1Phone: profile.contact1Phone ?? "",
          contact1Role: profile.contact1Role ?? "Family",
          contact2Name: profile.contact2Name ?? "",
          contact2Phone: profile.contact2Phone ?? "",
          contact2Role: profile.contact2Role ?? "Friend",
          guardianName: profile.guardianName ?? "Mom",
          alertMessage: profile.alertMessage ?? "I may be in danger. My last known location:",
          defaultDuration: Number(profile.defaultDuration ?? 10),
          pin: String(profile.pin ?? "").split("").slice(0, 4),
        },
      });
    } catch (error) {
      console.error("Profile login failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/cancel-alert", (req, res) => {
    const { walkId } = req.body;
    console.log(`Cancelling alert for walkId: ${walkId}`);

    if (activeAlerts[walkId]) {
      activeAlerts[walkId].status = 'cancelled';
      activeAlerts[walkId].shadowModeActive = false;
      activeAlerts[walkId].automaticSosTriggered = false;
      clearAlertTimer(walkId);
    }

    // In a real app, we'd send SMS here
    console.log(`✅ SAAHAS UPDATE: [Name] has confirmed they are safe. No further action is needed. Thank you for being there.`);

    res.json({ success: true });
  });

  app.post("/api/profile/location", async (req, res) => {
    try {
      const normalizedPhone = normalizeStoredPhone(req.body.userPhone);
      const lat = toFiniteNumber(req.body.lat);
      const lng = toFiniteNumber(req.body.lng);
      const walkId = String(req.body.walkId ?? "").trim();
      const label = String(req.body.label ?? "").trim();

      if (!normalizedPhone || lat === null || lng === null) {
        throw new Error("A valid phone number and coordinates are required.");
      }

      const location: AlertLocation = {
        lat,
        lng,
        updatedAt: Date.now(),
        label: label || undefined,
      };

      await profilesCollection.updateOne(
        { phone: normalizedPhone },
        {
          $set: {
            phone: normalizedPhone,
            fullName: String(req.body.userName ?? "").trim(),
            lastKnownLocation: location,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );

      if (walkId && activeAlerts[walkId]) {
        activeAlerts[walkId].latestLocation = location;
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Profile location update failed:", error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/notify-walk-start", async (req, res) => {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

      if (!accountSid || !authToken || !whatsappFrom) {
        throw new Error("Missing Twilio WhatsApp environment variables.");
      }

      const { userName, userPhone, emergencyContacts, walkDurationMinutes, walkId } = req.body;

      const normalizedContacts = normalizeEmergencyContacts(emergencyContacts);

      if (normalizedContacts.length === 0) {
        throw new Error("No valid emergency contact phone numbers provided.");
      }

      const twilioClient = Twilio(accountSid, authToken);

      await Promise.all(
        normalizedContacts.map((contact: { name: string; phone: string }) => {
          return twilioClient.messages.create({
            from: whatsappFrom,
            to: normalizeWhatsAppPhone(contact.phone),
            body: `🚶‍♀️ Saahas Safety Alert

Hi ${contact.name}, this is an automated safety notification.

${userName} has started a monitored walk and is expected to reach safely in ${walkDurationMinutes} minutes.

Walk ID: ${walkId}

If you do not receive a "Reached Safely" confirmation within this time, please try reaching ${userName} at ${userPhone}.

— Sent via Saahas Safety App`,
          });
        }),
      );

      res.json({ success: true });
    } catch (error) {
      console.error("WhatsApp walk start notification failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/notify-walk-overdue", async (req, res) => {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

      if (!accountSid || !authToken || !whatsappFrom) {
        throw new Error("Missing Twilio WhatsApp environment variables.");
      }

      const { userName, userPhone, emergencyContacts, walkId } = req.body;

      const normalizedContacts = normalizeEmergencyContacts(emergencyContacts);

      if (normalizedContacts.length === 0) {
        throw new Error("No valid emergency contact phone numbers provided.");
      }

      const twilioClient = Twilio(accountSid, authToken);

      await Promise.all(
        normalizedContacts.map((contact: { name: string; phone: string }) => {
          return twilioClient.messages.create({
            from: whatsappFrom,
            to: normalizeWhatsAppPhone(contact.phone),
            body: `🚨 Saahas Emergency Alert

Hi ${contact.name}, this is an automated emergency notification.

${userName} has not ensured that she arrived safely after the monitored walk timer ended.

Please try contacting her immediately at ${userPhone}.

Walk ID: ${walkId}

— Sent via Saahas Safety App`,
          });
        }),
      );

      res.json({ success: true });
    } catch (error) {
      console.error("WhatsApp walk overdue notification failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/notify-safe-arrival", async (req, res) => {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

      if (!accountSid || !authToken || !whatsappFrom) {
        throw new Error("Missing Twilio WhatsApp environment variables.");
      }

      const { userName, userPhone, emergencyContacts, walkId } = req.body;
      const normalizedContacts = normalizeEmergencyContacts(emergencyContacts);

      if (normalizedContacts.length === 0) {
        throw new Error("No valid emergency contact phone numbers provided.");
      }

      const twilioClient = Twilio(accountSid, authToken);

      const results = await Promise.allSettled(
        normalizedContacts.map((contact: { name: string; phone: string }) => {
          const message = `✅ Saahas Safe Arrival

Hi ${contact.name}, this is an automated safety notification.

${userName} has confirmed that she arrived safely after the monitored walk.

Walk ID: ${walkId}

No further action is needed, but you can still contact ${userName} at ${userPhone} if required.

— Sent via Saahas Safety App`;

          return twilioClient.messages.create({
            from: whatsappFrom,
            to: normalizeWhatsAppPhone(contact.phone),
            body: message,
          });
        }),
      );

      const failed = results
        .map((result, index) => (result.status === "rejected" ? {
          contact: normalizedContacts[index].name,
          phone: normalizedContacts[index].phone,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        } : null))
        .filter((item): item is { contact: string; phone: string; error: string } => item !== null);

      if (failed.length > 0) {
        console.warn("Some WhatsApp safe-arrival messages failed:", failed);
        return res.status(207).json({ success: false, partial: true, failed });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("WhatsApp safe-arrival notification failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/notify-emergency-alert", async (req, res) => {
    try {
      const { userName, userPhone, emergencyContacts, walkId, alertReason, message, latestLocation } = req.body;

      const normalizedUserPhone = normalizeStoredPhone(userPhone);
      const normalizedWalkId = String(walkId ?? "").trim();

      const normalizedContacts = normalizeEmergencyContacts(emergencyContacts);

      if (normalizedContacts.length === 0) {
        throw new Error("No valid emergency contact phone numbers provided.");
      }

      const fallbackMessage = `🚨 SAAHAS ALERT 🚨
${userName} may be in danger.
Reason: ${alertReason || "Emergency alert triggered"}

Please contact ${userName} immediately at ${userPhone}.

Walk ID: ${walkId || "Unavailable"}

— Sent via Saahas Safety App`;
      const latestAlertLocation = latestLocation && typeof latestLocation === "object"
        ? {
            lat: toFiniteNumber((latestLocation as { lat?: unknown }).lat),
            lng: toFiniteNumber((latestLocation as { lng?: unknown }).lng),
            updatedAt: toFiniteNumber((latestLocation as { time?: unknown }).time) ?? Date.now(),
            label: String((latestLocation as { label?: unknown }).label ?? "").trim() || undefined,
          }
        : null;
      const normalizedLatestLocation = latestAlertLocation && latestAlertLocation.lat !== null && latestAlertLocation.lng !== null
        ? {
            lat: latestAlertLocation.lat,
            lng: latestAlertLocation.lng,
            updatedAt: latestAlertLocation.updatedAt,
            label: latestAlertLocation.label,
          }
        : null;
      const acknowledgementBlock = `

Reply YES within 60 seconds if you are taking action.
Reply NO if you cannot help right now.`;
      const outboundMessage = `${message || fallbackMessage}${acknowledgementBlock}`;

      if (!normalizedWalkId) {
        throw new Error("walkId is required for emergency alert tracking.");
      }

      activeAlerts[normalizedWalkId] = {
        walkId: normalizedWalkId,
        userName: String(userName ?? "").trim() || "User",
        userPhone: normalizedUserPhone,
        alertReason: String(alertReason ?? "").trim() || "Emergency alert triggered",
        status: "waiting_ack",
        shadowModeActive: false,
        automaticSosTriggered: false,
        emergencyContacts: normalizedContacts,
        latestLocation: normalizedLatestLocation,
        createdAt: Date.now(),
        ackDeadlineAt: Date.now() + 60000,
        acknowledgedAt: null,
        acknowledgedBy: null,
        nearbyUsersNotified: 0,
        nearbyUsers: [],
        messageSidByContact: {},
        timer: null,
      };

      scheduleAlertEscalation(normalizedWalkId);

      const results = await Promise.allSettled(
        normalizedContacts.map(async (contact: { name: string; phone: string }) => {
          const { twilioClient, whatsappFrom } = getTwilioConfig();
          const twilioMessage = await twilioClient.messages.create({
            from: whatsappFrom,
            to: normalizeWhatsAppPhone(contact.phone),
            body: outboundMessage,
          });
          activeAlerts[normalizedWalkId].messageSidByContact[contact.phone] = twilioMessage.sid;
          return twilioMessage;
        }),
      );

      const failed = results
        .map((result, index) => (result.status === "rejected" ? {
          contact: normalizedContacts[index].name,
          phone: normalizedContacts[index].phone,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        } : null))
        .filter((item): item is { contact: string; phone: string; error: string } => item !== null);

      if (failed.length > 0) {
        console.warn("Some WhatsApp emergency alerts failed:", failed);
        return res.status(207).json({ success: false, partial: true, failed });
      }

      res.json({
        success: true,
        ackDeadlineAt: activeAlerts[normalizedWalkId].ackDeadlineAt,
        shadowModeActive: false,
      });
    } catch (error) {
      console.error("WhatsApp emergency alert failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/alert-status/:walkId", (req, res) => {
    const walkId = String(req.params.walkId ?? "").trim();
    const activeAlert = activeAlerts[walkId];

    if (!activeAlert) {
      return res.status(404).json({
        success: false,
        error: "Alert not found.",
      });
    }

    res.json({
      success: true,
      alert: {
        walkId: activeAlert.walkId,
        status: activeAlert.status,
        shadowModeActive: activeAlert.shadowModeActive,
        automaticSosTriggered: activeAlert.automaticSosTriggered,
        ackDeadlineAt: activeAlert.ackDeadlineAt,
        acknowledgedAt: activeAlert.acknowledgedAt,
        acknowledgedBy: activeAlert.acknowledgedBy,
        nearbyUsersNotified: activeAlert.nearbyUsersNotified,
        latestLocation: activeAlert.latestLocation,
      },
    });
  });

  app.post("/api/twilio/whatsapp/reply", (req, res) => {
    const fromPhone = normalizeStoredPhone(req.body.From);
    const body = String(req.body.Body ?? "").trim().toUpperCase();
    const twiml = new Twilio.twiml.MessagingResponse();

    if (!fromPhone) {
      twiml.message("We could not verify your number. Please try again.");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    const activeAlert = findLatestPendingAlertForPhone(fromPhone);

    if (!activeAlert) {
      twiml.message("There is no active Saahas alert waiting for your reply right now.");
      res.type("text/xml");
      return res.send(twiml.toString());
    }

    if (body === "YES") {
      clearAlertTimer(activeAlert.walkId);
      activeAlert.status = "acknowledged";
      activeAlert.shadowModeActive = false;
      activeAlert.automaticSosTriggered = false;
      activeAlert.acknowledgedAt = Date.now();
      activeAlert.acknowledgedBy = fromPhone;
      twiml.message("Acknowledged. Shadow Mode will remain off. Thank you for responding quickly.");
    } else if (body === "NO") {
      void activateShadowMode(activeAlert.walkId).catch((error) => {
        console.error("Shadow mode activation after NO reply failed:", error);
      });
      twiml.message("Understood. Shadow Mode and automatic SOS escalation have been activated.");
    } else {
      twiml.message("Reply YES if you are taking action, or NO if you cannot help right now.");
    }

    res.type("text/xml");
    return res.send(twiml.toString());
  });

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
