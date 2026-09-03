import { useState, useEffect } from "react";
import {
  X,
  Key,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Bell,
  BellOff,
  Info,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ClickUpClient, exchangeOAuthCode } from "../lib/clickup";
import { isTauri, notify, openExternalUrl, clearTrayTitle } from "../lib/native";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@clickup-lite-control-panel/ui/components/button";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CLIENT_ID = (import.meta.env.VITE_CLICKUP_CLIENT_ID as string) || "";
const CLIENT_SECRET = (import.meta.env.VITE_CLICKUP_CLIENT_SECRET as string) || "";
const REDIRECT_URI =
  (import.meta.env.VITE_CLICKUP_REDIRECT_URI as string) || "http://localhost:3456/callback";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    token,
    setToken,
    user,
    setUser,
    setTeam,
    syncAll,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useAppStore();

  const [authMethod, setAuthMethod] = useState<"oauth" | "token">("oauth");
  const [personalTokenInput, setPersonalTokenInput] = useState(token || "");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleVerifyToken = async (tokenToTest: string) => {
    setIsVerifying(true);
    setStatusMessage(null);
    try {
      const client = new ClickUpClient(tokenToTest);
      const currentUser = await client.getCurrentUser();
      const teams = await client.getTeams();

      setUser(currentUser);
      setToken(tokenToTest);

      if (teams.length > 0 && teams[0]) {
        setTeam(teams[0].id, teams[0].name);
      }

      await syncAll();
      setStatusMessage({ type: "success", text: `Connected as ${currentUser.username}!` });
      notify("ClickUp Connected", `Logged in as ${currentUser.username}`);
    } catch (err) {
      console.error(err);
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to verify credentials",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Listen for native OAuth redirect callback on localhost:3456
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenFn: (() => void) | undefined;
    listen<string>("oauth-code", async (event) => {
      const code = event.payload;
      if (code) {
        setIsVerifying(true);
        setStatusMessage({
          type: "success",
          text: "Code received! Exchanging token with ClickUp...",
        });
        try {
          const accessToken = await exchangeOAuthCode(CLIENT_ID, CLIENT_SECRET, code);
          await handleVerifyToken(accessToken);
        } catch (err) {
          setStatusMessage({
            type: "error",
            text: err instanceof Error ? err.message : "Failed to exchange OAuth token",
          });
          setIsVerifying(false);
        }
      }
    }).then((unsub) => {
      unlistenFn = unsub;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  if (!isOpen) return null;

  const handleStartOAuth = async () => {
    if (!CLIENT_ID) {
      setStatusMessage({ type: "error", text: "Client ID not found in .env" });
      return;
    }
    const redirectUri = encodeURIComponent(REDIRECT_URI);
    const authUrl = `https://app.clickup.com/api?client_id=${CLIENT_ID}&redirect_uri=${redirectUri}`;

    setStatusMessage({
      type: "success",
      text: "Opening ClickUp in your browser...",
    });

    // Native browser launch via macOS 'open'
    await openExternalUrl(authUrl);
  };

  const handleDisconnect = () => {
    setToken(null);
    setUser(null);
    useAppStore.setState({
      activeTimer: null,
      elapsedSeconds: 0,
      todayLoggedSeconds: 0,
    });
    clearTrayTitle();
    setStatusMessage({ type: "success", text: "Logged out" });
  };

  const handleTestNotification = async () => {
    setIsTestingNotification(true);
    setNotificationStatus(null);
    try {
      const ok = await notify(
        "ClickUp Lite",
        "Notifications are active! Break and Pomodoro alerts will show here.",
      );
      if (ok) {
        setNotificationStatus({
          type: "success",
          text: "Notification triggered! macOS suppresses banners if the app window is focused—switch apps or check Notification Center.",
        });
      } else {
        setNotificationStatus({
          type: "error",
          text: "Notification permission was not granted. Please check macOS System Settings > Notifications.",
        });
      }
    } catch (err) {
      setNotificationStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to trigger notification",
      });
    } finally {
      setIsTestingNotification(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="flex flex-col w-full max-w-sm max-h-[520px] rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-3.5 py-2.5 bg-muted/30 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Key className="h-3.5 w-3.5 text-primary" />
            <span>Settings & Notifications</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-col gap-3.5 p-3.5 text-xs overflow-y-auto">
          {/* Method Selector */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setAuthMethod("oauth")}
              className={`flex-1 rounded-md py-1 text-center font-medium transition-colors cursor-pointer ${
                authMethod === "oauth"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              OAuth 2.0 (Recommended)
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod("token")}
              className={`flex-1 rounded-md py-1 text-center font-medium transition-colors cursor-pointer ${
                authMethod === "token"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Personal API Key
            </button>
          </div>

          {authMethod === "oauth" ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Credentials Configured in .env</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  Clicking below will launch your default web browser to authorize ClickUp Lite.
                </p>
              </div>

              <Button
                size="default"
                disabled={isVerifying}
                onClick={handleStartOAuth}
                className="w-full gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium shadow-md cursor-pointer py-2"
              >
                {isVerifying ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                <span>{isVerifying ? "Exchanging token..." : "Connect with ClickUp"}</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Direct personal token from ClickUp Settings ➔ Apps ➔ API Token (`pk_...`).
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">
                  Personal Token
                </label>
                <input
                  type="password"
                  value={personalTokenInput}
                  onChange={(e) => setPersonalTokenInput(e.target.value)}
                  placeholder="pk_..."
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
                />
              </div>
              <Button
                size="sm"
                disabled={isVerifying || !personalTokenInput.trim()}
                onClick={() => handleVerifyToken(personalTokenInput.trim())}
                className="mt-1 w-full gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
              >
                {isVerifying ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3" />
                )}
                <span>{isVerifying ? "Verifying..." : "Save & Verify Token"}</span>
              </Button>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`flex items-center gap-1.5 rounded-md p-2 text-[11px] ${
                statusMessage.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Currently Logged In Indicator */}
          {user && (
            <div className="rounded-md border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex justify-between items-center">
              <div>
                <span className="font-semibold text-foreground">{user.username}</span> ({user.email}
                )
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-destructive hover:underline cursor-pointer font-medium"
              >
                Disconnect
              </button>
            </div>
          )}

          {/* Notification Diagnostics & Settings */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Bell className="h-3.5 w-3.5 text-amber-500" />
                <span>Desktop Notifications</span>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  notificationsEnabled
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {notificationsEnabled ? (
                  <>
                    <Bell className="h-3 w-3" /> Enabled
                  </>
                ) : (
                  <>
                    <BellOff className="h-3 w-3" /> Muted
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-tight">
              Used for 25m Pomodoro breaks and 2-hour continuous work alerts.
            </p>

            <Button
              size="sm"
              variant="outline"
              disabled={isTestingNotification}
              onClick={handleTestNotification}
              className="mt-1 w-full gap-1.5 text-xs cursor-pointer border-dashed"
            >
              {isTestingNotification ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Bell className="h-3 w-3 text-primary" />
              )}
              <span>Send Test Desktop Notification</span>
            </Button>

            {notificationStatus && (
              <div
                className={`rounded-md p-2 text-[10.5px] leading-relaxed flex items-start gap-1.5 ${
                  notificationStatus.type === "success"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
                }`}
              >
                {notificationStatus.type === "success" ? (
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                )}
                <span>{notificationStatus.text}</span>
              </div>
            )}

            <div className="flex items-start gap-1 text-[10px] text-muted-foreground/80 mt-1">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                <strong>ClickUp Note:</strong> ClickUp's public API does not provide a notifications
                or inbox endpoint. Workspace events require webhooks or active timers.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
