# StreamUnify Xbox deployment agent

Windows 10/11, .NET Framework 4.8 (included in supported Windows installations). No administrator access, PowerShell policy changes, GitHub token, inbound port, or self-hosted CI runner is required.

Open `StreamUnifyXboxAgent.exe`, enter the HTTPS address shown in Xbox Dev Home and your **Device Portal** username/password, then choose **Install and connect**. Confirm the console certificate when asked. These credentials are encrypted with Windows DPAPI for the current Windows user and never sent to GitHub or ChatGPT. The executable installs under `%LOCALAPPDATA%\StreamUnifyXboxAgent`. The selected startup checkbox adds this executable to the current user's Run registry key. Closing the window leaves a system-tray agent; **Exit agent** stops it.

The agent checks GitHub every 90 seconds for a deliberately published `xbox-device-<run ID>` prerelease. Ordinary commits, pull requests, builds, and other releases do not deploy. Only the explicit deployment-command workflow publishes these releases. The release supplies a version and SHA-256 hashes. The agent validates the package name, identity, publisher, architecture, signature presence, hashes, and installed version before uploading over certificate-pinned HTTPS. The Xbox verifies the package signature during installation. Downgrades are skipped. It verifies the installed version before marking the command complete. Repeated commands are idempotent.

Keep the PC awake and Xbox in Developer Mode on the same local network. Nothing can install while this PC is asleep. The agent does not launch the app automatically, reboot the console, or alter other apps. Check Device Portal for app launch and hardware testing.

To remove: exit the agent, remove `StreamUnifyXboxAgent` from the current user's `Software\Microsoft\Windows\CurrentVersion\Run`, and delete the agent folder. Removing `settings.dat` removes its saved credentials.

## Validation
Windows CI compiles the program and runs `--self-test` for URL restrictions, deployment manifest restrictions, and DPAPI round-tripping. Physical Xbox upload and the interactive setup are separate integration checks and must not be represented as passed before they run.

## Issuing an approved command

After the full review and user-requested preview/approval, create or update the `xbox/device-commands` branch with this workflow and set `xbox/deployment-command.json` to `enabled: true`, the successful Xbox `runId`, and its exact `commit`. The branch push publishes a prerelease containing that build's package and dependencies. Do not change this file for an unreviewed build. Set it to disabled before creating the command branch if no deployment is intended. The initial file is disabled; installing the agent does not authorize an unreviewed build.
