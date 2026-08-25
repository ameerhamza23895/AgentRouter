import { FormEvent, useState } from "react";

const ITEMS = [
  "Suit",
  "Dress",
  "Jacket",
  "Earrings",
  "Necklace",
  "Watch",
  "Glasses",
  "Hat",
  "Shoes",
];

type TryOnResponse = {
  imageUrl?: string | null;
  prompt?: string;
  routeKey?: string;
  creditsCharged?: number;
  note?: string;
  wallet?: unknown;
  error?: string;
};

type Props = {
  onWallet: (wallet: unknown) => void;
};

export default function TryOn({ onWallet }: Props) {
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [wearableFile, setWearableFile] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState("");
  const [wearablePreview, setWearablePreview] = useState("");
  const [itemType, setItemType] = useState("Suit");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TryOnResponse | null>(null);

  function pickFile(
    file: File | undefined,
    setFile: (f: File | null) => void,
    setPreview: (url: string) => void,
  ) {
    if (!file) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!personFile || !wearableFile || loading) return;

    const body = new FormData();
    body.append("person", personFile);
    body.append("wearable", wearableFile);
    body.append("itemType", itemType);
    body.append("notes", notes);

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/try-on", { method: "POST", body });
      const data = (await res.json()) as TryOnResponse;
      if (!res.ok) throw new Error(data.error || "Try-on failed");
      setResult(data);
      if (data.wallet) onWallet(data.wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Try-on failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="tryon" onSubmit={onSubmit}>
      <div className="upload-grid">
        <label className="drop">
          <span>Your photo</span>
          {personPreview ? (
            <img src={personPreview} alt="Person preview" />
          ) : (
            <em>Click to upload a face or full-body photo</em>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              pickFile(e.target.files?.[0], setPersonFile, setPersonPreview)
            }
          />
        </label>
        <label className="drop">
          <span>Wearable item</span>
          {wearablePreview ? (
            <img src={wearablePreview} alt="Wearable preview" />
          ) : (
            <em>Upload a suit, earrings, necklace, glasses…</em>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              pickFile(e.target.files?.[0], setWearableFile, setWearablePreview)
            }
          />
        </label>
      </div>

      <div className="chips">
        {ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            className={itemType === item ? "active" : ""}
            onClick={() => setItemType(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <textarea
        className="tryon-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional: gold necklace, slim black suit, wear on left ear…"
      />

      <button
        className="send tryon-go"
        type="submit"
        disabled={loading || !personFile || !wearableFile}
      >
        {loading ? "Generating look…" : "See how it looks"}
      </button>

      {error && <div className="warn">{error}</div>}

      {result?.imageUrl && (
        <div className="tryon-result">
          <h2>After wearing</h2>
          <img src={result.imageUrl} alt="Generated try-on result" />
          <div className="meta">
            {result.routeKey && <span>Route: {result.routeKey}</span>}
            <span>Credits used: {result.creditsCharged ?? 0}</span>
          </div>
          {result.note && <p className="note">{result.note}</p>}
        </div>
      )}
    </form>
  );
}
