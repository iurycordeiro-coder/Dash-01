import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFilePath = path.join(__dirname, "..", "dashboard-data.json");

interface DashboardDataRecord {
  data: any;
  userId?: string;
  timestamp: Date;
}

// Inicializar armazenamento
export async function initializeDatabase() {
  try {
    // Verificar se arquivo existe, se não criar vazio
    try {
      await fs.access(dataFilePath);
      console.log("✅ Dashboard data file found");
    } catch {
      await fs.writeFile(dataFilePath, JSON.stringify(null), "utf-8");
      console.log("✅ Dashboard data file created");
    }
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
}

// Salvar dados do dashboard
export async function saveDashboardData(data: any, userId?: string) {
  try {
    const record: DashboardDataRecord = {
      data,
      userId: userId || "system",
      timestamp: new Date(),
    };

    await fs.writeFile(dataFilePath, JSON.stringify(record, null, 2), "utf-8");
    console.log("✅ Dashboard data saved to file");
  } catch (error) {
    console.error("❌ Error saving dashboard data:", error);
    throw error;
  }
}

// Recuperar dados mais recentes do dashboard
export async function getDashboardData() {
  try {
    const fileContent = await fs.readFile(dataFilePath, "utf-8");
    const record = JSON.parse(fileContent) as DashboardDataRecord | null;

    if (!record) {
      return null;
    }

    return {
      data: record.data,
      updatedAt: new Date(record.timestamp),
    };
  } catch (error) {
    console.error("❌ Error getting dashboard data:", error);
    return null;
  }
}

// Obter data da última atualização
export async function getLastUpdateTime() {
  try {
    const fileContent = await fs.readFile(dataFilePath, "utf-8");
    const record = JSON.parse(fileContent) as DashboardDataRecord | null;

    if (!record) {
      return null;
    }

    return new Date(record.timestamp);
  } catch (error) {
    console.error("❌ Error getting last update time:", error);
    return null;
  }
}
