# StreamUnify project guidance

- The user's **master** command includes the website, iOS, Android, and Xbox app. Updates requested for master must cover all four platforms, with platform-specific adaptations where required.
- Show a browser preview before publishing master changes. Xbox also requires a signed development package and physical console checks; a browser preview alone does not establish console compatibility.
- The Xbox interface packages the current shared `index.html`, membership, provider, and Pick Together modules through `scripts/prepare-xbox.mjs`. Keep product features in those shared sources so future master updates reach Xbox. Keep TV styling, controller navigation, and Xbox account/purchase adapters under `xbox/web`.
- Preserve platform store purchase rules. The Xbox preview recognizes existing membership and does not offer purchases or direct provider-app launches until those integrations are implemented and tested.
