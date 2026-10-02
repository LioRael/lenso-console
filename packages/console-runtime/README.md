# Console runtime support

These private workspace crates own local process lifecycle and detachable Agent
stream support. They are shared by Console providers and reference Hosts; neither
crate is a second Console SDK or an application entry point.

- [Agent turn relay](agent-turn-relay/README.md): bounded queues, transient activity and stream detachment.
- [Local Agent launcher](local-agent-launcher/README.md): registration, Home seeding and process supervision.

Public authoring APIs belong to `packages/console-authoring`; provider defaults
belong to `plugins/console`.
