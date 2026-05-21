import express from "express";
import { saveDashboardData, getDashboardData, getLastUpdateTime } from "./db";

const router = express.Router();

// Endpoint para salvar dados do dashboard
router.post("/api/dashboard/save", async (req, res) => {
  try {
    const { data, userId } = req.body;

    if (!data) {
      return res.status(400).json({ error: "Data is required" });
    }

    console.log("POST /api/dashboard/save - received dashboard save request", {
      userId: userId || null,
      items: Array.isArray(data?.raw_data) ? data.raw_data.length : undefined,
    });

    await saveDashboardData(data, userId);

    // Notificar todos os clientes conectados sobre a atualização
    const broadcastDataUpdate = (req as any).broadcastDataUpdate;
    if (broadcastDataUpdate) {
      broadcastDataUpdate(data);
      console.log("POST /api/dashboard/save - broadcastDataUpdate called");
    }

    res.json({
      success: true,
      message: "Dashboard data saved successfully",
    });
  } catch (error) {
    console.error("Error saving dashboard data:", error);
    res.status(500).json({ error: "Failed to save dashboard data" });
  }
});

// Endpoint para recuperar dados do dashboard
router.get("/api/dashboard/data", async (req, res) => {
  try {
    const result = await getDashboardData();

    console.log("GET /api/dashboard/data - returning data", {
      hasData: !!result,
      itemsCount: Array.isArray(result?.data?.raw_data) ? result.data.raw_data.length : 0,
      updatedAt: result?.updatedAt,
    });

    if (!result) {
      return res.json({
        data: null,
        updatedAt: null,
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Error getting dashboard data:", error);
    res.status(500).json({ error: "Failed to get dashboard data" });
  }
});

// Endpoint para obter timestamp da última atualização
router.get("/api/dashboard/last-update", async (req, res) => {
  try {
    const lastUpdate = await getLastUpdateTime();

    res.json({
      lastUpdate,
    });
  } catch (error) {
    console.error("Error getting last update time:", error);
    res.status(500).json({ error: "Failed to get last update time" });
  }
});

export default router;
