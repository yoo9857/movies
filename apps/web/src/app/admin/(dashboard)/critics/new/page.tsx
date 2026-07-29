import { CriticForm } from "@/components/admin/CriticForm";

export const dynamic = "force-dynamic";

export default function NewCriticPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Add critic</h1>
      <div className="mt-6">
        <CriticForm />
      </div>
    </div>
  );
}
