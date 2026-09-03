import { Toaster } from "@clickup-lite-control-panel/ui/components/sonner";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import "../index.css";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "ClickUp Lite Control Panel",
      },
      {
        name: "description",
        content: "Lightweight ClickUp Menubar Companion",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="h-screen w-screen overflow-hidden bg-background text-foreground antialiased select-none font-sans">
          <Outlet />
        </div>
        <Toaster richColors position="top-center" />
      </ThemeProvider>
    </>
  );
}
