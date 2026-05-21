import { useEffect, useState, useCallback, useRef } from "react";

interface SyncState {
  isConnected: boolean;
  lastUpdate: Date | null;
  isSyncing: boolean;
  wsConnected: boolean;
}

export function useDashboardSync(onDataUpdate: (data: any) => void) {
  const [syncState, setSyncState] = useState<SyncState>({
    isConnected: false,
    lastUpdate: null,
    isSyncing: false,
    wsConnected: false,
  });

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsReconnectAttemptsRef = useRef<number>(0);

  // Conectar ao WebSocket com backoff exponencial
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const customWsUrl = import.meta.env.VITE_WS_URL;
      const wsUrl =
        customWsUrl ||
        `${protocol}//${window.location.hostname}${window.location.port === "3000" ? ":3001" : window.location.port ? `:${window.location.port}` : ""}`;

      console.log("🔄 Attempting WebSocket connection to:", wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("✅ WebSocket connected to", wsUrl);
        wsReconnectAttemptsRef.current = 0; // Reset attempts on success
        setSyncState((prev) => ({
          ...prev,
          wsConnected: true,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "data-update") {
            console.log("📡 Data update received from WebSocket:", message.payload);
            lastUpdateTimeRef.current = message.timestamp;
            onDataUpdate(message.payload);
            
            setSyncState((prev) => ({
              ...prev,
              isConnected: true,
              lastUpdate: new Date(message.timestamp),
            }));
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = () => {
        console.log("❌ WebSocket disconnected. Polling fallback active.");
        setSyncState((prev) => ({
          ...prev,
          wsConnected: false,
        }));
        
        // Exponential backoff: 3s, 6s, 12s, 24s, max 60s
        const delay = Math.min(3000 * Math.pow(2, wsReconnectAttemptsRef.current), 60000);
        wsReconnectAttemptsRef.current += 1;
        
        console.log(`📡 WebSocket will retry in ${delay}ms (attempt ${wsReconnectAttemptsRef.current})`);
        wsReconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      };

      ws.onerror = (error) => {
        console.warn("⚠️ WebSocket error (this is normal if server is not running):", error?.toString?.() || error);
        setSyncState((prev) => ({
          ...prev,
          wsConnected: false,
        }));
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Error creating WebSocket:", error);
    }
  }, [onDataUpdate]);

  // Salvar dados no backend
  const saveDashboardData = useCallback(async (data: any, userId?: string) => {
    setSyncState((prev) => ({
      ...prev,
      isSyncing: true,
    }));

    try {
      const response = await fetch("/api/dashboard/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data, userId }),
      });

      if (!response.ok) {
        throw new Error("Failed to save dashboard data");
      }

      console.log("✅ Dashboard data saved to server");

      // Ensure we fetch fresh data from server after saving so clients
      // that don't receive the WebSocket message still get updated state.
      try {
        await fetchDashboardData();
      } catch (e) {
        console.warn("fetchDashboardData after save failed:", e);
      }

      // Enviar atualização via WebSocket também
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "data-update",
          payload: data,
        }));
      }

      setSyncState((prev) => ({
        ...prev,
        isConnected: true,
        lastUpdate: new Date(),
      }));
    } catch (error) {
      console.error("Error saving dashboard data:", error);
      setSyncState((prev) => ({
        ...prev,
        isConnected: false,
      }));
    } finally {
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
      }));
    }
  }, [fetchDashboardData]);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Add cache-busting parameter to ensure fresh data from server
      const response = await fetch(`/api/dashboard/data?t=${Date.now()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const result = await response.json();

      console.log("📊 fetchDashboardData response:", {
        hasData: !!result.data,
        itemsCount: Array.isArray(result.data?.raw_data) ? result.data.raw_data.length : 0,
        updatedAt: result.updatedAt,
      });

      if (result.data) {
        // Always update on fetch (don't skip even if timestamp looks same)
        // This ensures UI updates after import
        console.log("✅ Updating data with fresh fetch", {
          hasRawData: !!result.data.raw_data,
          itemsCount: result.data.raw_data?.length,
        });
        lastUpdateTimeRef.current = result.updatedAt;
        // Pass the data object directly (contains raw_data, kpis, etc.)
        onDataUpdate(result.data);

        setSyncState((prev) => ({
          ...prev,
          isConnected: true,
          lastUpdate: result.updatedAt ? new Date(result.updatedAt) : new Date(),
        }));
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      setSyncState((prev) => ({
        ...prev,
        isConnected: false,
      }));
    }
  }, [onDataUpdate]);

  // Conectar ao WebSocket e fazer polling
  useEffect(() => {
    // Conectar ao WebSocket
    connectWebSocket();

    // Fetch inicial
    fetchDashboardData();

    // Polling a cada 30 segundos como fallback
    pollingIntervalRef.current = setInterval(() => {
      fetchDashboardData();
    }, 30000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket, fetchDashboardData]);

  return {
    ...syncState,
    saveDashboardData,
    fetchDashboardData,
  };
}
