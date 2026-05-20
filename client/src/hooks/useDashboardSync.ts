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

  // Conectar ao WebSocket
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

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
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
        console.log("❌ WebSocket disconnected");
        setSyncState((prev) => ({
          ...prev,
          wsConnected: false,
        }));
        
        // Tentar reconectar após 3 segundos
        wsReconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setSyncState((prev) => ({
          ...prev,
          wsConnected: false,
        }));
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
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
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/data");

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const result = await response.json();

      if (result.data) {
        // Notificar apenas se houver dados novos
        if (lastUpdateTimeRef.current !== result.updatedAt) {
          lastUpdateTimeRef.current = result.updatedAt;
          onDataUpdate(result.data);
        }

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
