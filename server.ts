import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock server state
  const activeAlerts: Record<string, { status: string; shadowModeActive: boolean }> = {};

  // API routes
  app.post("/api/cancel-alert", (req, res) => {
    const { walkId } = req.body;
    console.log(`Cancelling alert for walkId: ${walkId}`);

    if (activeAlerts[walkId]) {
      activeAlerts[walkId].status = 'cancelled';
      activeAlerts[walkId].shadowModeActive = false;
    }

    // In a real app, we'd send SMS here
    console.log(`✅ SAAHAS UPDATE: [Name] has confirmed they are safe. No further action is needed. Thank you for being there.`);

    res.json({ success: true });
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
