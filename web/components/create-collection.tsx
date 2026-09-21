'use client';

import { useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useContractWrite } from '@/hooks/use-contract-write';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function CreateCollection({
  variant = 'outline',
  label = 'New collection',
}: {
  variant?: 'outline' | 'accent';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const { send } = useContractWrite();

  const valid = name.trim().length > 0 && symbol.trim().length > 0;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;

    setBusy(true);
    const form = new FormData(event.currentTarget);
    let contractURI = '';

    // Collection metadata is optional. Only pin when there is something
    // beyond the on-chain name to store.
    const hasMetadata =
      String(form.get('description') ?? '').trim() !== '' ||
      String(form.get('external_link') ?? '').trim() !== '' ||
      (form.get('image') as File | null)?.size ||
      (form.get('banner_image') as File | null)?.size;

    try {
      if (hasMetadata) {
        const pinning = toast.loading('Pinning collection metadata…');
        const response = await fetch('/api/upload/collection', {
          method: 'POST',
          body: form,
        });
        const payload = await response.json();

        if (!response.ok) {
          toast.error(payload.error ?? 'Upload failed', { id: pinning });
          return;
        }

        contractURI = payload.contractURI;
        toast.success('Pinned', { id: pinning });
      }

      const receipt = await send({
        on: 'factory',
        functionName: 'create',
        args: [name.trim(), symbol.trim(), contractURI],
        pendingMessage: 'Deploying your collection…',
        successMessage: `${name.trim()} is live`,
      });

      if (receipt) {
        formRef.current?.reset();
        setName('');
        setSymbol('');
        setOpen(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} type="button">
          <PlusIcon />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a collection</DialogTitle>
          <DialogDescription>
            Deploys your own ERC-721 contract as a minimal proxy, so it costs a
            fraction of a full deployment. You own it outright.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Bored Pixel Club"
              maxLength={64}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-symbol">Symbol</Label>
            <Input
              id="collection-symbol"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="BPC"
              maxLength={11}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Everything below is optional collection metadata (ERC-7572) — what
            marketplaces show on your collection page. You can add it later.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-description">Description</Label>
            <Textarea
              id="collection-description"
              name="description"
              maxLength={1000}
              className="min-h-20"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-image">Avatar</Label>
            <Input
              id="collection-image"
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-banner">Banner</Label>
            <Input
              id="collection-banner"
              name="banner_image"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-link">Website</Label>
            <Input
              id="collection-link"
              name="external_link"
              type="url"
              placeholder="https://example.com"
            />
          </div>

          <Button type="submit" variant="accent" disabled={!valid || busy}>
            Deploy collection
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
