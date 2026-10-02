# Hub model catalog

The Hub reads `GET /slides/models`. The response is an array of usable provider groups:

```ts
{
  providerId: string;
  providerName: string;
  ready: true;
  degraded: boolean;
  degradedReason?: string;
  nativeSearch: boolean;
  efforts?: readonly string[];
  modelEfforts?: Readonly<Record<string, readonly string[]>>;
  models: readonly {
    id: string;
    name: string;
    inputModalities: readonly ("text" | "image")[];
  }[];
}
```

`SlidesHostRuntime.listModelCatalog()` reads DSH adapter registrations, model lists and
resolved reasoning metadata. Each request refreshes the catalog; the most recent snapshot
is retained only for synchronous tool assembly and invalidated on adapter updates.
Per-provider discovery failures produce empty model lists, not old fallback options.

`withDshModelCatalog()` intersects the credential roster with that catalog. The same helper
backs `/slides/providers`, `/slides/health` and the intent/create/resume/switch model guard.
Unknown or removed models fail closed. Broken providers are hidden from the picker and
unready in health; transiently degraded ones remain selectable. OAuth readiness is merged
immutably from the isolated product home, so logout and reads of another home cannot
inherit a previous grant's state. No credential values appear in these responses.

Live input modalities and reasoning efforts override imported profile metadata, including
empty lists. Without a runtime catalog API (older runtimes/test doubles), the roster uses
local configuration; absent input declarations stay unknown. Hosted search remains a route declaration
because DSH model metadata does not expose it. Image tools follow execution configuration.

The picker is an anchored popup with provider-grouped listbox options and a reasoning-effort
radiogroup. The list scrolls independently, and selecting a model closes the popup.
Its selected key and effort live in JS state rather than native select values.
The picker stores the original provider/model keys independently; its combined option key
splits at the first slash, preserving slash-containing model IDs. A failed/empty refresh
disables Send but preserves the saved preference. Settings continues using `/slides/providers`
for credential management, including unavailable routes.

Subscription HTTP routes require both `webServer` and `connection` injected into the OAuth
wrapper. The DSH startup link performs the normal browser-session exchange. Unauthenticated
requests still return 401; the product does not bypass this fence or copy DSH App grants.
