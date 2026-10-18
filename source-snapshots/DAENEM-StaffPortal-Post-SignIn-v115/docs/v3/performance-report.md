# Performance evidence

Native sources: 10 photographs, 58.55 MiB combined. Responsive WebP variants: 13.69 MiB combined. These are repository totals, not initial page transfer measurements. Only the selected sign-in image is requested for its composition.

640/1280/2560/3840 variants are downsampled from untouched originals. Desktop portrait crops use 3840 variants; browsers at 2200+ CSS width receive originals. That intentionally favors source fidelity and can create a large 4K transfer, especially the 13,578px Singapore image. No bandwidth, memory or decode budget has been certified.

The application uses lazy workspace loading and local table pagination. The shared context was isolated after browser QA found a refresh-related duplicate-context error; loaded desktop workspaces were rechecked successfully.

No LCP, INP, CLS, throttled mobile, route-transition percentile or large-data virtualization benchmark is reported because it was not measured. Production build success is not a performance benchmark.
