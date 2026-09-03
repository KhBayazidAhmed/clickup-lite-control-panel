import { useState, useEffect } from "react";
import {
  X,
  Key,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Bell,
  BellOff,
  Info,
  Target,
  Timer,
  Rocket,
  CloudOff,
  CloudCheck,
  Pin,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ClickUpClient, exchangeOAuthCode } from "../lib/clickup";
import {
  isTauri,
  notify,
  openExternalUrl,
  clearTrayTitle,
  isAutostartEnabled,
  setAutostart,
} from "../lib/native";
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
    isPinned,
    setIsPinned,
    dailyGoalHours,
    setDailyGoalHours,
    pomodoroDurationMinutes,
    setPomodoroDurationMinutes,
    notificationsEnabled,
    setNotificationsEnabled,
    offlineTimeQueue,
    flushOfflineQueue,
  } = useAppStore();

  const [authMethod, setAuthMethod] = useState<"oauth" | "token">("oauth");
  const [personalTokenInput, setPersonalTokenInput] = useState(token || "");
  const [customGoalInput, setCustomGoalInput] = useState(String(dailyGoalHours));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isFlushingOffline, setIsFlushingOffline] = useState(false);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setCustomGoalInput(String(dailyGoalHours));
  }, [dailyGoalHours]);

  const handleCustomGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomGoalInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 24) {
      setDailyGoalHours(parsed);
    }
  };

  const handleCustomGoalBlur = () => {
    const parsed = parseFloat(customGoalInput);
    if (isNaN(parsed) || parsed < 0.5) {
      setDailyGoalHours(8);
      setCustomGoalInput("8");
    } else if (parsed > 24) {
      setDailyGoalHours(24);
      setCustomGoalInput("24");
    } else {
      const rounded = Math.round(parsed * 10) / 10;
      setDailyGoalHours(rounded);
      setCustomGoalInput(String(rounded));
    }
  };

  // Check launch at login state when opening modal
  useEffect(() => {
    if (isOpen) {
      isAutostartEnabled().then((enabled) => {
        setAutostartEnabled(enabled);
      });
    }
  }, [isOpen]);

  const handleToggleAutostart = async () => {
    const next = !autostartEnabled;
    const ok = await setAutostart(next);
    if (ok) {
      setAutostartEnabled(next);
      setStatusMessage({
        type: "success",
        text: next ? "Launch at login enabled" : "Launch at login disabled",
      });
    } else {
      setStatusMessage({
        type: "error",
        text: "Failed to update launch at login setting",
      });
    }
  };

  const handleManualFlushOffline = async () => {
    setIsFlushingOffline(true);
    try {
      await flushOfflineQueue();
    } finally {
      setIsFlushingOffline(false);
    }
  };

  const handleVerifyToken = async (tokenToTest: string) => {
    setIsVerifying(true);
    setStatusMessage(null);

    try {
      const client = new ClickUpClient(tokenToTest);
      const fetchedUser = await client.getCurrentUser();

      if (!fetchedUser || !fetchedUser.id) {
        throw new Error("Could not retrieve user details.");
      }

      const teams = await client.getTeams();
      const firstTeam = teams?.[0];

      setToken(tokenToTest);
      setUser(fetchedUser);

      if (firstTeam) {
        setTeam(firstTeam.id, firstTeam.name);
      }

      setStatusMessage({
        type: "success",
        text: `Connected as ${fetchedUser.username}!`,
      });

      // Trigger initial background sync
      setTimeout(() => {
        syncAll();
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Token validation failed";
      setStatusMessage({
        type: "error",
        text:
          msg.includes("401") || msg.includes("OAUTH")
            ? "Invalid token or unauthorized. Check ClickUp Settings."
            : `Connection error: ${msg}`,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Listen for OAuth deep link / callback code
  useEffect(() => {
    if (!isOpen) return;

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const unsub = await listen<{ code: string }>("oauth-code-received", async (event) => {
          const code = event.payload.code;
          if (!code) return;

          setIsVerifying(true);
          setStatusMessage(null);

          try {
            const accessToken = await exchangeOAuthCode(CLIENT_ID, CLIENT_SECRET, code);

            if (accessToken) {
              await handleVerifyToken(accessToken);
            } else {
              throw new Error("Failed to receive access token.");
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "OAuth exchange failed";
            setStatusMessage({
              type: "error",
              text: `OAuth error: ${msg}`,
            });
          } finally {
            setIsVerifying(false);
          }
        });

        unlisten = unsub;
      } catch (e) {
        console.error("Could not set up oauth event listener:", e);
      }
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  const handleOAuthLogin = () => {
    if (!CLIENT_ID) {
      setStatusMessage({
        type: "error",
        text: "OAuth Client ID is missing. Add VITE_CLICKUP_CLIENT_ID to .env",
      });
      return;
    }

    const authUrl = `https://app.clickup.com/api?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI,
    )}`;

    openExternalUrl(authUrl);
    setStatusMessage({
      type: "success",
      text: "Opening ClickUp authentication in your browser...",
    });
  };

  const handlePersonalTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personalTokenInput.trim()) {
      setStatusMessage({
        type: "error",
        text: "Please enter your personal API token.",
      });
      return;
    }

    handleVerifyToken(personalTokenInput.trim());
  };

  const handleDisconnect = () => {
    setToken(null);
    setPersonalTokenInput("");
    clearTrayTitle();
    setStatusMessage({
      type: "success",
      text: "Disconnected from ClickUp workspace.",
    });
  };

  const handleTestNotification = async () => {
    setIsTestingNotification(true);
    setNotificationStatus(null);
    try {
      const ok = await notify(
        "ClickUp Lite Notifications",
        "Notifications are active! You will get alerts for timer finishes and due tasks.",
      );
      if (ok) {
        setNotificationStatus({
          type: "success",
          text: "Notification triggered successfully! Check your macOS Notification Center.",
        });
      } else {
        setNotificationStatus({
          type: "error",
          text: "Notification delivery returned false. Ensure macOS System Settings > Notifications allows alerts for this app.",
        });
      }
    } catch (e: unknown) {
      const err = e as Error;
      setNotificationStatus({
        type: "error",
        text: `Notification test error: ${err.message || String(e)}`,
      });
    } finally {
      setIsTestingNotification(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="flex h-full max-h-[520px] w-full max-w-[360px] flex-col rounded-xl border border-border bg-card shadow-2xl text-card-foreground animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-3 py-2.5">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
            <Key className="h-3.5 w-3.5 text-primary" />
            <span>ClickUp Preferences</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3.5 text-xs">
          {/* Status Alert Banner */}
          {statusMessage && (
            <div
              className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
                statusMessage.type === "success"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-destructive/15 text-destructive border border-destructive/20"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-tight">{statusMessage.text}</span>
            </div>
          )}

          {/* Authentication Mode Tabs */}
          <div className="flex rounded-lg bg-muted p-0.5 border border-border/60">
            <button
              type="button"
              onClick={() => setAuthMethod("oauth")}
              className={`flex-1 py-1 text-center font-medium rounded-md transition-all cursor-pointer ${
                authMethod === "oauth"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              OAuth 2.0 (Browser)
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod("token")}
              className={`flex-1 py-1 text-center font-medium rounded-md transition-all cursor-pointer ${
                authMethod === "token"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Personal Token
            </button>
          </div>

          {/* OAuth Tab Panel */}
          {authMethod === "oauth" ? (
            <div className="flex flex-col gap-2.5 rounded-lg border border-border/80 bg-muted/20 p-2.5">
              <p className="text-[11px] text-muted-foreground leading-normal">
                Authorize ClickUp directly through your browser. Once approved, the desktop app
                automatically captures your session.
              </p>
              <Button
                type="button"
                onClick={handleOAuthLogin}
                disabled={isVerifying}
                className="w-full flex items-center justify-center gap-1.5 cursor-pointer h-8 text-xs font-semibold"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Connecting to ClickUp...</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-3 w-3" />
                    <span>Authorize with ClickUp</span>
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* Personal Token Tab Panel */
            <form
              onSubmit={handlePersonalTokenSubmit}
              className="flex flex-col gap-2.5 rounded-lg border border-border/80 bg-muted/20 p-2.5"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="personal-token-input"
                  className="text-[11px] font-medium text-foreground"
                >
                  ClickUp API Key (pk_...)
                </label>
                <input
                  id="personal-token-input"
                  type="password"
                  value={personalTokenInput}
                  onChange={(e) => setPersonalTokenInput(e.target.value)}
                  placeholder="pk_1234567_ABC..."
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono text-foreground focus:border-foreground focus:outline-none"
                />
              </div>
              <Button
                type="submit"
                disabled={isVerifying || !personalTokenInput.trim()}
                className="w-full flex items-center justify-center gap-1.5 cursor-pointer h-8 text-xs font-semibold"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Validating Key...</span>
                  </>
                ) : (
                  <span>Save and Connect</span>
                )}
              </Button>
            </form>
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

          {/* Productivity & Focus Goals */}
          <div className="flex flex-col gap-2.5 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span>Daily Target & Focus Session</span>
            </div>

            {/* Daily Goal Hours: Custom Input + Presets */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Daily Work Goal:</span>
                <div className="flex items-center gap-1">
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="24"
                      value={customGoalInput}
                      onFocus={(e) => e.target.select()}
                      onChange={handleCustomGoalChange}
                      onBlur={handleCustomGoalBlur}
                      placeholder="8"
                      className="h-6 w-14 rounded-md border border-border bg-background px-1.5 pr-4 text-center text-xs font-semibold text-foreground focus:border-foreground focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="pointer-events-none absolute right-1.5 text-[10px] text-muted-foreground">
                      h
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1">
                {[4, 6, 7.5, 8, 10].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setDailyGoalHours(item);
                      setCustomGoalInput(String(item));
                    }}
                    className={`flex-1 h-5.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                      dailyGoalHours === item
                        ? "bg-foreground text-background shadow-xs font-bold"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    title={item === 7.5 ? "7 hours 30 minutes" : `${item} hours`}
                  >
                    {item}h
                  </button>
                ))}
              </div>
            </div>

            {/* Pomodoro Duration */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Timer className="h-3 w-3 text-amber-500" />
                <span>Pomodoro Focus:</span>
              </div>
              <div className="flex items-center gap-1">
                {[15, 20, 25, 30, 45].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setPomodoroDurationMinutes(mins)}
                    className={`h-6 rounded px-1.5 text-[10.5px] font-medium transition-colors cursor-pointer ${
                      pomodoroDurationMinutes === mins
                        ? "bg-amber-500 text-white shadow-xs font-semibold"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Window & Launch Behavior */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            {/* Pin Window Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Pin
                  className={`h-3.5 w-3.5 ${isPinned ? "text-primary fill-current -rotate-45" : "text-muted-foreground"}`}
                />
                <span>Pin Window</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  isPinned
                    ? "bg-primary/15 text-primary font-medium"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {isPinned ? "Pinned (Stay Open)" : "Auto-Hide"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Keep the control panel open and floating even when clicking on other applications.
            </p>

            <div className="h-px bg-border/60 my-0.5" />

            {/* Launch at Login */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Rocket className="h-3.5 w-3.5 text-indigo-500" />
                <span>Launch at Login</span>
              </div>
              <button
                type="button"
                onClick={handleToggleAutostart}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  autostartEnabled
                    ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-medium"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {autostartEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Automatically launch ClickUp Lite in your macOS menu bar upon system startup.
            </p>
          </div>

          {/* Offline Sync Queue Section */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                {offlineTimeQueue.length > 0 ? (
                  <CloudOff className="h-3.5 w-3.5 text-amber-500" />
                ) : (
                  <CloudCheck className="h-3.5 w-3.5 text-emerald-500" />
                )}
                <span>Offline Storage & Sync</span>
              </div>
              {offlineTimeQueue.length > 0 && (
                <button
                  type="button"
                  disabled={isFlushingOffline}
                  onClick={handleManualFlushOffline}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium hover:bg-amber-500/25 cursor-pointer disabled:opacity-50"
                >
                  {isFlushingOffline ? "Syncing..." : "Sync Now"}
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {offlineTimeQueue.length > 0
                ? `${offlineTimeQueue.length} session(s) pending sync to ClickUp. Will auto-upload when internet reconnects.`
                : "All timer sessions are synced to ClickUp. Safe to track time offline anytime."}
            </p>
          </div>

          {/* Notification Diagnostics & Settings */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                {notificationsEnabled ? (
                  <Bell className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span>Notifications & Sound</span>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  notificationsEnabled
                    ? "bg-primary/15 text-primary font-medium"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {notificationsEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Receive native notifications when timers finish, Pomodoro intervals trigger, or tasks
              are due soon.
            </p>
            {notificationsEnabled && isTauri() && (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Test notification delivery
                  </span>
                  <button
                    type="button"
                    disabled={isTestingNotification}
                    onClick={handleTestNotification}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-accent text-foreground transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isTestingNotification ? (
                      <>
                        <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <span>Send Test Alert</span>
                    )}
                  </button>
                </div>
                {notificationStatus && (
                  <p
                    className={`text-[10px] leading-tight ${
                      notificationStatus.type === "success"
                        ? "text-emerald-500"
                        : "text-destructive"
                    }`}
                  >
                    {notificationStatus.text}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Helper / Info Note */}
          <div className="flex items-start gap-1.5 rounded-lg border border-border/60 bg-muted/40 p-2 text-[10px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.2 text-muted-foreground/80" />
            <span className="leading-tight">
              ClickUp tokens are stored locally on your device in secure storage and never sent to
              third parties.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
