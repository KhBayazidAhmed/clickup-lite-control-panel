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
    customClientId,
    customClientSecret,
    setCustomOAuthCredentials,
  } = useAppStore();

  const [authMethod, setAuthMethod] = useState<"oauth" | "token">("oauth");
  const [personalTokenInput, setPersonalTokenInput] = useState(token || "");
  const [inputClientId, setInputClientId] = useState(customClientId || CLIENT_ID);
  const [inputClientSecret, setInputClientSecret] = useState(customClientSecret || CLIENT_SECRET);
  const [showOAuthInputs, setShowOAuthInputs] = useState(false);
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

  // Keep local inputs in sync with store or env
  useEffect(() => {
    if (customClientId) {
      setInputClientId(customClientId);
    } else if (CLIENT_ID) {
      setInputClientId(CLIENT_ID);
    }
    if (customClientSecret) {
      setInputClientSecret(customClientSecret);
    } else if (CLIENT_SECRET) {
      setInputClientSecret(CLIENT_SECRET);
    }
  }, [customClientId, customClientSecret]);

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
    try {
      const newState = !autostartEnabled;
      const success = await setAutostart(newState);
      if (success) {
        setAutostartEnabled(newState);
      }
    } catch (e) {
      console.error("Failed to toggle autostart:", e);
    }
  };

  const handleFlushOffline = async () => {
    if (offlineTimeQueue.length === 0) return;
    setIsFlushingOffline(true);
    try {
      await flushOfflineQueue();
      setStatusMessage({
        type: "success",
        text: "Offline queue successfully synced to ClickUp!",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setStatusMessage({
        type: "error",
        text: `Failed to flush offline queue: ${msg}`,
      });
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

    let unlistenCode: (() => void) | undefined;
    let unlistenReceived: (() => void) | undefined;

    const handleOAuthPayload = async (rawPayload: unknown) => {
      let code: string | undefined;
      if (typeof rawPayload === "string") {
        code = rawPayload;
      } else if (rawPayload && typeof rawPayload === "object") {
        code = (rawPayload as { code?: string }).code;
      }
      if (!code) return;

      setIsVerifying(true);
      setStatusMessage(null);

      try {
        const activeClientId = inputClientId.trim() || customClientId || CLIENT_ID;
        const activeClientSecret = inputClientSecret.trim() || customClientSecret || CLIENT_SECRET;

        if (!activeClientId || !activeClientSecret) {
          throw new Error("ClickUp Client ID or Client Secret is missing.");
        }

        const accessToken = await exchangeOAuthCode(activeClientId, activeClientSecret, code);

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
    };

    const setupListener = async () => {
      try {
        unlistenCode = await listen<unknown>("oauth-code", (event) => {
          handleOAuthPayload(event.payload);
        });
        unlistenReceived = await listen<unknown>("oauth-code-received", (event) => {
          handleOAuthPayload(event.payload);
        });
      } catch (e) {
        console.error("Could not set up oauth event listener in modal:", e);
      }
    };

    setupListener();

    return () => {
      if (unlistenCode) unlistenCode();
      if (unlistenReceived) unlistenReceived();
    };
  }, [isOpen, inputClientId, inputClientSecret, customClientId, customClientSecret]);

  const handleOAuthLogin = () => {
    const activeClientId = inputClientId.trim() || customClientId || CLIENT_ID;

    if (!activeClientId) {
      setShowOAuthInputs(true);
      setStatusMessage({
        type: "error",
        text: "OAuth Client ID is missing. Please enter your credentials below.",
      });
      return;
    }

    if (inputClientId.trim() || inputClientSecret.trim()) {
      setCustomOAuthCredentials(inputClientId.trim(), inputClientSecret.trim());
    }

    const authUrl = `https://app.clickup.com/api?client_id=${activeClientId}&redirect_uri=${encodeURIComponent(
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
          text: "Notification triggered successfully! Check your system notification center.",
        });
      } else {
        setNotificationStatus({
          type: "error",
          text: "Notification delivery returned false. Check that your OS notification settings allow alerts for this app.",
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
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
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

              {/* Custom OAuth App Credentials Configuration */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowOAuthInputs(!showOAuthInputs)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>
                    {showOAuthInputs
                      ? "▲ Hide App Credentials"
                      : "▼ Custom OAuth Credentials (Optional)"}
                  </span>
                </button>

                {showOAuthInputs && (
                  <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-background/50 p-2 text-[11px]">
                    <div>
                      <label
                        htmlFor="oauth-client-id"
                        className="text-[10px] font-medium text-muted-foreground"
                      >
                        ClickUp Client ID
                      </label>
                      <input
                        id="oauth-client-id"
                        type="text"
                        value={inputClientId}
                        onChange={(e) => setInputClientId(e.target.value)}
                        placeholder="e.g. 5PLBHTJ..."
                        className="mt-0.5 h-7 w-full rounded border border-border bg-background px-2 text-[11px] font-mono text-foreground focus:border-foreground focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="oauth-client-secret"
                        className="text-[10px] font-medium text-muted-foreground"
                      >
                        ClickUp Client Secret
                      </label>
                      <input
                        id="oauth-client-secret"
                        type="password"
                        value={inputClientSecret}
                        onChange={(e) => setInputClientSecret(e.target.value)}
                        placeholder="e.g. secret_..."
                        className="mt-0.5 h-7 w-full rounded border border-border bg-background px-2 text-[11px] font-mono text-foreground focus:border-foreground focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomOAuthCredentials(inputClientId.trim(), inputClientSecret.trim());
                        setStatusMessage({
                          type: "success",
                          text: "Custom OAuth credentials saved.",
                        });
                      }}
                      className="self-end rounded bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
                    >
                      Save Credentials
                    </button>
                  </div>
                )}
              </div>
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

          {/* Offline Sync Queue Manager */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                {offlineTimeQueue.length > 0 ? (
                  <CloudOff className="h-3.5 w-3.5 text-amber-500" />
                ) : (
                  <CloudCheck className="h-3.5 w-3.5 text-emerald-500" />
                )}
                <span>Offline Time Queue</span>
              </div>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">
                {offlineTimeQueue.length} pending
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-normal">
              {offlineTimeQueue.length > 0
                ? "Time tracked while disconnected is held here safely and flushed automatically."
                : "All time tracking entries are fully synced with ClickUp servers."}
            </p>
            {offlineTimeQueue.length > 0 && (
              <Button
                type="button"
                onClick={handleFlushOffline}
                disabled={isFlushingOffline || !token}
                className="h-7 text-xs font-medium w-full flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${isFlushingOffline ? "animate-spin" : ""}`} />
                <span>{isFlushingOffline ? "Syncing..." : "Sync Offline Queue Now"}</span>
              </Button>
            )}
          </div>

          {/* App Preferences */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            <span className="font-medium text-foreground text-[11px]">Panel Behavior</span>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>Keep Window Pinned</span>
                  <span className="text-[10px] text-muted-foreground">
                    Prevent auto-hiding when clicking away
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>Launch at Login</span>
                  <span className="text-[10px] text-muted-foreground">
                    Start in menubar when your Mac boots
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autostartEnabled}
                onChange={handleToggleAutostart}
                className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
            </div>
          </div>

          {/* Daily Goal Configuration */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Daily Target Hours</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Set your target tracked hours per day for the progress bar.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1">
                {[6, 7.5, 8, 9].map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => {
                      setDailyGoalHours(hrs);
                      setCustomGoalInput(String(hrs));
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                      dailyGoalHours === hrs
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {hrs}h
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  value={customGoalInput}
                  onChange={handleCustomGoalChange}
                  onBlur={handleCustomGoalBlur}
                  className="h-6 w-12 rounded border border-border bg-background px-1 text-center font-mono text-xs text-foreground focus:border-foreground focus:outline-none"
                />
                <span className="text-[10px] text-muted-foreground">hrs</span>
              </div>
            </div>
          </div>

          {/* Pomodoro Duration Settings */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Timer className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Pomodoro Duration</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Configure focus session interval in minutes.
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {[15, 25, 45, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setPomodoroDurationMinutes(mins)}
                  className={`flex-1 py-1 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                    pomodoroDurationMinutes === mins
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          {/* Notification System Controls */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {notificationsEnabled ? (
                  <Bell className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">Native Notifications</span>
                  <span className="text-[10px] text-muted-foreground">
                    Alerts for timer completions and due tasks
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
            </div>

            {/* Test Notification Button */}
            {notificationsEnabled && (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-border/50 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Verify notification delivery:
                  </span>
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    disabled={isTestingNotification}
                    className="text-[10px] font-medium text-primary hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {isTestingNotification ? "Sending..." : "Send Test Alert"}
                  </button>
                </div>
                {notificationStatus && (
                  <div
                    className={`rounded p-1.5 text-[10px] leading-tight ${
                      notificationStatus.type === "success"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {notificationStatus.text}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Information Notice */}
          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-normal px-1">
            <Info className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              Credentials and active timers are securely persisted locally on your device.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
