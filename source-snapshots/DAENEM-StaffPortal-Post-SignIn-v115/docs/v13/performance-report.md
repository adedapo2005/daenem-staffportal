# V13 performance evidence

Managed Chromium recorded 8 representative render transitions. The slowest local review-workbench transition was 1935 ms and the largest inspected DOM contained 806 nodes. These timings include the review harness and are not production Core Web Vitals.

The current built artifact contains 178 files totaling 35069412 bytes. Exact file sizes and hashes are in `build-asset-measurements.csv`. Sign-in uses responsive 640/1280/2560/3840 derivatives. Production RUM, throttled Web Vitals, memory/decode profiling and large-production-data virtualization remain blocked until backend/repository mapping.
