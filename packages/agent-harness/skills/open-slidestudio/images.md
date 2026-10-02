# Images

Read `_agent/capability.md` first.

If search or generate is **on**: decide which pages need a real subject (place, product, person, apparatus). Call `search_image` or `generate_image` in a batch. Save under `media/`. Then `write_page` around those files. Empty `src` is dropped.

If search and generate are **off**: complete pages with type, shape, table, and chart. That is a finished deck on this host.

User uploads win over search. Search wins over generate. A page earns an image when seeing beats describing. Stretching a file is a failed page.
