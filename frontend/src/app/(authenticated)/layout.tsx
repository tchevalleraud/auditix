import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import ContextProvider from "@/components/ContextProvider";
import FeedbackButton from "@/components/FeedbackButton";
import BackendReadyGate from "@/components/BackendReadyGate";
import IdleLogoutGuard from "@/components/IdleLogoutGuard";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BackendReadyGate>
      <ContextProvider>
        <IdleLogoutGuard />
        <Sidebar />
        <div className="pl-64">
          <Topbar />
          <main className="p-6">{children}</main>
        </div>
        <FeedbackButton />
      </ContextProvider>
    </BackendReadyGate>
  );
}
