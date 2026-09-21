'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { SendIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useContractWrite } from '@/hooks/use-contract-write';
import { useMyCollections } from '@/hooks/use-market';
import { PageHeader } from '@/components/page-header';
import { CreateCollection } from '@/components/create-collection';
import { TraitEditor } from '@/components/trait-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const MAX_ROYALTY_BPS = 1000; // mirrors MarketplaceCollection.MAX_ROYALTY_BPS

export default function CreatePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { send } = useContractWrite();
  const { data: collections, isLoading: loadingCollections } =
    useMyCollections();
  const formRef = useRef<HTMLFormElement>(null);

  const [collection, setCollection] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Default to the first collection once they load.
  const target = collection || collections?.[0]?.address || '';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const file = form.get('file');
    const royaltyPercent = Number(form.get('royalty') ?? 0);

    const found: Record<string, string> = {};
    if (!target) found.collection = 'Create a collection to mint into.';
    if (!(file instanceof File) || file.size === 0) {
      found.file = 'Choose an image to mint.';
    }
    if (
      !Number.isFinite(royaltyPercent) ||
      royaltyPercent < 0 ||
      royaltyPercent > MAX_ROYALTY_BPS / 100
    ) {
      found.royalty = `Royalty must be between 0 and ${MAX_ROYALTY_BPS / 100}%.`;
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    const pinning = toast.loading('Pinning to IPFS…');

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: form,
      });
      const payload = await response.json();

      if (!response.ok) {
        toast.error(payload.error ?? 'Upload failed', { id: pinning });
        return;
      }

      toast.success('Pinned', { id: pinning });

      const receipt = await send({
        on: target as `0x${string}`,
        functionName: 'mint',
        args: [payload.tokenURI, BigInt(Math.round(royaltyPercent * 100))],
        pendingMessage: 'Minting…',
        successMessage: 'Minted — set a price to put it on the market',
      });

      if (receipt) {
        formRef.current?.reset();
        router.push('/assets');
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong',
        { id: pinning },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <PageHeader
        title="Create an NFT"
        subtitle="Mint into one of your collections. Listing it for sale or opening an auction is a separate step, from My NFTs."
      />

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="collection">Collection</Label>
          {loadingCollections ? (
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          ) : collections && collections.length > 0 ? (
            <div className="flex gap-2">
              <select
                id="collection"
                value={target}
                onChange={(event) => setCollection(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {collections.map((item) => (
                  <option key={item.address} value={item.address}>
                    {item.name} ({item.symbol})
                  </option>
                ))}
              </select>
              <CreateCollection />
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5">
              <p className="text-sm text-muted-foreground">
                You do not have a collection yet. Create one to mint into — it
                is your own contract, deployed as a minimal proxy.
              </p>
              <CreateCollection variant="accent" label="Create your collection" />
            </div>
          )}
          {errors.collection && (
            <p className="text-sm text-destructive">{errors.collection}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="file">
            <UploadIcon className="mr-1.5 inline size-4" />
            Artwork
          </Label>
          <Input
            id="file"
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            aria-invalid={Boolean(errors.file)}
            aria-describedby={errors.file ? 'file-error' : undefined}
          />
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, GIF or WebP, up to 10 MB.
          </p>
          {errors.file && (
            <p id="file-error" className="text-sm text-destructive">
              {errors.file}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required minLength={2} maxLength={50} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            required
            maxLength={1000}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="royalty">Creator royalty</Label>
          <Input
            id="royalty"
            name="royalty"
            type="number"
            min={0}
            max={MAX_ROYALTY_BPS / 100}
            step={0.5}
            defaultValue={5}
            aria-invalid={Boolean(errors.royalty)}
            aria-describedby="royalty-help"
          />
          <p id="royalty-help" className="text-xs text-muted-foreground">
            Your cut of every future resale, up to {MAX_ROYALTY_BPS / 100}%.
            Paid automatically on any sale through this marketplace.
          </p>
          {errors.royalty && (
            <p className="text-sm text-destructive">{errors.royalty}</p>
          )}
        </div>

        <TraitEditor />

        <div className="flex flex-col gap-2">
          <Label htmlFor="background_color">Background colour (optional)</Label>
          <Input
            id="background_color"
            name="background_color"
            placeholder="FFD700"
            maxLength={6}
            pattern="[0-9a-fA-F]{6}"
            aria-describedby="background-help"
          />
          <p id="background-help" className="text-xs text-muted-foreground">
            Six hex characters, no leading #.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="animation_url">Animation URL (optional)</Label>
          <Input
            id="animation_url"
            name="animation_url"
            type="url"
            placeholder="https://… (GLB, MP4, WEBM, MP3, HTML)"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="external_url">Link (optional)</Label>
          <Input
            id="external_url"
            name="external_url"
            type="url"
            placeholder="https://example.com"
          />
        </div>

        <Button
          type="submit"
          size="lg"
          variant="accent"
          disabled={!isConnected || busy || !target}
        >
          <SendIcon />
          {isConnected ? 'Mint' : 'Connect a wallet first'}
        </Button>
      </form>
    </div>
  );
}
