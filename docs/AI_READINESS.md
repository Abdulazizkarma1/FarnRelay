# AI integration checks

## Confirmed issue, 1 November 2026

The live investigation endpoint returned HTTP 502 with `Meta returned an invalid or untraceable brief`. The request asked for JSON in instructions but did not constrain the provider's response format. The same provider connection successfully transcribed the synthetic English demo recording. A SAM request completed with no matching region; an earlier stored run had one region. Zero detections are a valid model result, not proof that the API failed.

## Request contract

- Responses API structured output uses `text.format`, with a named `json_schema` and `strict: true`.
- The schema is derived from the existing Zod ingestion schema. Every object disallows unknown fields and requires its declared properties.
- Reported observations must cite a supplied evidence ID or the report/answers. Visible observations can cite only photos actually sent to the model. No-photo requests require an empty visible-observations list.
- Schema generation does not replace server-side validation. Invented citations and visible claims linked to non-photo evidence still fail.
- Spark requests use low reasoning effort, bounded output tokens and `store: false`. No model output is substituted with a scripted fallback.
- Legacy evidence briefs use the same structured-output approach and default to `muse-spark-1.3` when no model override is provided.
- Controlled error messages distinguish provider access, credits/rate limits, incomplete output and invalid output. Raw provider payloads, credentials and report contents are not included in error messages. Failed-run history retains the controlled reason.
- SAM results explain matched regions or no matches. Regions are not a disease diagnosis. English transcription remains the supported automatic recording path; local-language recordings require human review.

## Local verification

`npm run lint`, `npm test` (61 tests), and `npm run build` pass. New contract tests cover constrained citation IDs, strict object structure, no-photo behavior, provider error classification and rejection of fabricated citations. An integration check with a real provider is required after deployment. A mocked response is not a measured production model result.

## References

- https://dev.meta.ai/docs/protocols/responses
- https://dev.meta.ai/docs/structured-output
- https://dev.meta.ai/docs/sam/segmenting
- https://dev.meta.ai/docs/speech-to-text
