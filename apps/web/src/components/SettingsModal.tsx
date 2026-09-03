import { useState, useEffect } from "react";
import {
  X,
  Key,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
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
  const { token, setToken, user, setUser, setTeam, syncAll } = useAppStore();

  const [authMethod, setAuthMethod] = useState<"oauth" | "token">("oauth");
  const [personalTokenInput, setPersonalTokenInput] = useState(token || "");
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
              ClickUp OAuth
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
        </div>
      </div>
    </div>
  );
}
