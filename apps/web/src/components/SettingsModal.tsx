import { useState, useEffect } from "react";
import { X, Key, CheckCircle, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ClickUpClient, exchangeOAuthCode } from "../lib/clickup";
import { isTauri, notify } from "../lib/native";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@clickup-lite-control-panel/ui/components/button";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_CLIENT_ID = (import.meta.env.VITE_CLICKUP_CLIENT_ID as string) || "";
const DEFAULT_CLIENT_SECRET = (import.meta.env.VITE_CLICKUP_CLIENT_SECRET as string) || "";
const DEFAULT_REDIRECT_URI =
  (import.meta.env.VITE_CLICKUP_REDIRECT_URI as string) || "http://localhost:3456/callback";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { token, setToken, user, setUser, setTeam, fetchTasks } = useAppStore();

  const [authMethod, setAuthMethod] = useState<"oauth" | "token">("oauth");
  const [personalTokenInput, setPersonalTokenInput] = useState(token || "");
  const [clientId, setClientId] = useState(DEFAULT_CLIENT_ID);
  const [clientSecret, setClientSecret] = useState(DEFAULT_CLIENT_SECRET);
  const [isVerifying, setIsVerifying] = useState(false);
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

      await fetchTasks();
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

  // Listen for native OAuth redirect callback from loopback listener
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
          const effectiveId = clientId.trim() || DEFAULT_CLIENT_ID;
          const effectiveSecret = clientSecret.trim() || DEFAULT_CLIENT_SECRET;
          const accessToken = await exchangeOAuthCode(effectiveId, effectiveSecret, code);
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
  }, [clientId, clientSecret]);

  if (!isOpen) return null;

  const handleStartOAuth = () => {
    const effectiveId = clientId.trim() || DEFAULT_CLIENT_ID;
    if (!effectiveId) {
      setStatusMessage({ type: "error", text: "Please provide a ClickUp Client ID" });
      return;
    }
    const redirectUri = encodeURIComponent(DEFAULT_REDIRECT_URI);
    const authUrl = `https://app.clickup.com/api?client_id=${effectiveId}&redirect_uri=${redirectUri}`;
    window.open(authUrl, "_blank");
    setStatusMessage({
      type: "success",
      text: "Browser opened. Approve access in ClickUp to complete connection.",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="flex flex-col w-full max-w-sm rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-3 py-2 bg-muted/30">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Key className="h-3.5 w-3.5 text-primary" />
            <span>ClickUp Integration</span>
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
        <div className="flex flex-col gap-3 p-3.5 text-xs">
          {/* Auth Method Switcher */}
          <div className="flex rounded-lg bg-muted/60 p-0.5">
            <button
              type="button"
              onClick={() => setAuthMethod("oauth")}
              className={`flex-1 rounded-md py-1 text-center font-medium transition-all ${
                authMethod === "oauth"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              OAuth 2.0 (Configured)
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod("token")}
              className={`flex-1 rounded-md py-1 text-center font-medium transition-all ${
                authMethod === "token"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Personal API Key
            </button>
          </div>

          {authMethod === "oauth" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Pre-configured from your <code>.env</code> file. Click below to authorize.
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">
                  Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. 5PLBHT..."
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="e.g. NVLEPI..."
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
                />
              </div>
              <div className="text-[10px] text-muted-foreground">
                Redirect URI:{" "}
                <span className="font-mono text-foreground">{DEFAULT_REDIRECT_URI}</span>
              </div>
              <Button
                size="sm"
                disabled={isVerifying}
                onClick={handleStartOAuth}
                className="mt-1 w-full gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
              >
                {isVerifying ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <ExternalLink className="h-3 w-3" />
                )}
                <span>{isVerifying ? "Exchanging token..." : "Connect with ClickUp"}</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Instant personal token from ClickUp Settings ➔ Apps ➔ API Token (`pk_...`).
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
            <div className="rounded-md border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground flex justify-between items-center">
              <div>
                <span className="font-semibold text-foreground">{user.username}</span> ({user.email}
                )
              </div>
              <button
                type="button"
                onClick={() => {
                  setToken(null);
                  setUser(null);
                  setStatusMessage({ type: "success", text: "Logged out" });
                }}
                className="text-destructive hover:underline cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
