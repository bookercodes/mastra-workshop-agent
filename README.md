# Mastra Workshop Agent (Maestro)

## Braintrust experiment

Run the event agent against the existing `Workshop topics` Braintrust dataset:

```bash
pnpm run eval:event-agent
```

The run creates a Braintrust experiment using the saved `event-agent` model parameters. It does not require the Mastra dev server, a remote eval server, or a tunnel.
