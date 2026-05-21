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

  // Conectar ao WebSocket com backoff exponencial e múltiplos candidatos
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const hostPort = `${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
      const candidates: string[] = [];

      // If user provided explicit WS URL via env, try it first
      const customWsUrl = import.meta.env.VITE_WS_URL;
      if (customWsUrl) candidates.push(customWsUrl);

      // Same-origin root (wss://host or ws://host)
      candidates.push(`${protocol}//${hostPort}`);

      // Same-origin with /ws path (some reverse proxies expect a path)
      candidates.push(`${protocol}//${hostPort}/ws`);

      let attempted = 0;
      const tryNext = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
        if (attempted >= candidates.length) {
          // Kick off a retry with exponential backoff
          const delay = Math.min(3000 * Math.pow(2, wsReconnectAttemptsRef.current), 60000);
          wsReconnectAttemptsRef.current += 1;
          wsReconnectTimeoutRef.current = setTimeout(() => tryNext(), delay);
          return;
        }

        const wsUrl = candidates[attempted++];
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
          console.log("❌ WebSocket closed for", wsUrl);
          // Try next candidate immediately
          if (wsRef.current === ws) wsRef.current = null;
          setSyncState((prev) => ({
            ...prev,
            wsConnected: false,
          }));
          tryNext();
        };

        ws.onerror = (error) => {
          console.warn("⚠️ WebSocket error for", wsUrl, error?.toString?.() || error);
          if (wsRef.current === ws) wsRef.current = null;
          setSyncState((prev) => ({
            ...prev,
            wsConnected: false,
          }));
          // Try the next candidate right away
          tryNext();
        };

        wsRef.current = ws;
      };

      // start trying candidates
      tryNext();
    } catch (error) {
      console.error("Error creating WebSocket:", error);
    }
  }, [onDataUpdate]);

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
