import { useAppStore } from "./store/app-store";
import { CreateHub } from "./components/CreateHub";
import { AgentRunView } from "./components/AgentRunView";
import { Workspace } from "./components/Workspace";

export function App() {
  const screen = useAppStore((s) => s.screen);
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);

  return (
    <div className="app-shell">
      {screen === "create" ? <CreateHub /> : null}
      {screen === "agent" ? <AgentRunView /> : null}
      {screen === "workspace" ? <Workspace /> : null}

      {toast ? (
        <div
          className={
            toast.kind === "info" ? "toast" : `toast toast--${toast.kind}`
          }
          role="status"
          onClick={clearToast}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
