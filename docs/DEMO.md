# Demonstration guide

## Before presenting

Deploy to staging using DEPLOYMENT.md. Create and verify one farmer, two officers and an administrator. Promote staff through the trusted bootstrap/admin flow, then sign in again. Enrol and challenge administrator MFA. Confirm actual model access and remaining credits. Use consented sample evidence and describe it accurately.

Do not present the public interface walkthrough as an AI result. It makes no upload or model request.

## A complete story

1. Farmer opens New report, selects maize, community and visible concern.
2. Add a whole-plant photo, a close view and a short recording. Label the recording language honestly.
3. Describe onset and extent. Review the evidence checklist, then submit.
4. Administrator assigns the case to a verified officer. The second officer should have no access to it.
5. Farmer requests useful questions and answers one. Officers see the updated context.
6. Officer listens to the original recording. For English, request transcription and correct important errors before relying on it. Other languages require human listening/translation.
7. Officer generates an evidence brief and follows a source citation. Generate plant regions and toggle overlays. Explain that a region is not a diagnosis.
8. Send a reviewed question or advice with a follow-up date. Farmer sees the reviewer and next step.
9. Farmer records a follow-up outcome and adds new evidence. The old AI brief is now outdated. Compare photographs, then review the current evidence.
10. Show Evaluation with real reviewed measurements if available. Otherwise show the explicit pending-validation state.

## Connectivity demonstration

On an already loaded, signed-in page, interrupt connectivity while writing a report. Confirm the draft is retained. Reconnect and retry from Device drafts. Completed uploads should be reused. A partial cloud case may exist before all attachments finish; the draft remains until confirmed.

A cold offline session cannot authenticate or retrieve private cloud cases. Do not promise background synchronisation, SMS, USSD or offline model inference.

## Failure states worth showing

- Unsupported crop goes to human review.
- Non-English recording stays available for listening.
- Missing photo still permits a text report.
- Stale officer edits are rejected with a conflict.
- Model failure leaves evidence available and permits a bounded manual retry.
- Reassignment blocks the former officer, including saving an in-flight AI result.
