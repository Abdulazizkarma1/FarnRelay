# Demo recording guide

Prepared 31 October 2026. The connected FarmRelay project contains three dedicated accounts and six fictional crop cases. Passwords are supplied privately to the owner in chat and are never committed.

## Accounts

| Login | Role | What to show |
| --- | --- | --- |
| farmer@demo.farmrelay.test | Farmer | Six reports, photos, recording, messages, reviewed next step |
| officer@demo.farmrelay.test | Extension Officer | Five assigned cases, questions, review and follow-up |
| admin@demo.farmrelay.test | Administrator | Enrol authenticator first, then show assignment and account management |

The accounts are email-confirmed to keep email delivery out of the recording. The admin must enrol an authenticator on Account before accessing protected administration. No MFA bypass or public demo-login endpoint was added.

## Cases

| Case | State | Recording purpose |
| --- | --- | --- |
| Maize, Tolon demo, brown leaf marks | In review | Photo, synthetic English voice note, labelled manual transcript, scripted officer advice and conversation |
| Maize, Savelugu demo, orange spots | Follow-up needed | Officer asks for more evidence |
| Maize, Nyankpala demo | Closed | Fictional improved outcome with follow-up history |
| Tomato, Tolon demo | Needs review | Honest referral outside current maize AI scope |
| Maize, Tolon demo, nearby marks | In review | Related observations are a signal, not a verified outbreak |
| Maize, Kumbungu demo | Needs review, high priority | Unassigned and incomplete; admin can assign it |

## Suggested recording, about three minutes

1. Farmer: open the dashboard and the Tolon maize case. Explain the observation, play the clearly labelled synthetic recording, show evidence and reviewed-next-step section.
2. Officer: show the assigned queue, evidence checklist, Savelugu question and the timeline. Explain that an image is not a confirmed diagnosis.
3. Farmer: show the Nyankpala follow-up and closed fictional outcome. Do not present it as real-world treatment effectiveness.
4. Admin: after authenticator enrolment, assign the incomplete Kumbungu case to the demo officer. Account for this state change if recording another take.

Keep passwords and authenticator codes out of the video. Use separate browser profiles for roles so login/logout does not interrupt the story.

## Evidence and honest claims

All descriptions and scripted conversations are labelled DEMO. Photographs are reference leaf images from PlantVillage, not images taken in the named Ghanaian communities. There are five private photo attachments and one synthetic English recording. The narration was generated locally using FFmpeg/libflite; it is not a farmer recording or a local-language transcription.

PlantVillage author dataset card: https://huggingface.co/datasets/mohanty/PlantVillage/blob/main/README.md . The card declares CC BY-SA 3.0. Original authors: Mohanty et al. Attribute PlantVillage and retain that licence for the converted WebP reference photographs. No field accuracy claim is supported by these staged cases.

### Reference images

- Corn_(maize)___Northern_Leaf_Blight: https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/Corn_(maize)___Northern_Leaf_Blight/005318c8-a5fa-4420-843b-23bdda7322c2___RS_NLB%203853%20copy.jpg
- Corn_(maize)___Common_rust_: https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/Corn_(maize)___Common_rust_/RS_Rust%201563.JPG
- Corn_(maize)___healthy: https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/Corn_(maize)___healthy/00031d74-076e-4aef-b040-e068cd3576eb___R.S_HL%208315%20copy%202.jpg
- Tomato___Early_blight: https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master/raw/color/Tomato___Early_blight/0012b9d2-2130-4a06-a834-b1f3af34f57e___RS_Erly.B%208389.JPG

## Verified scope and remaining AI check

All three accounts passed a live login through FarmRelay's production auth gateway and returned the correct profile role. Farmer summary returned six cases; officer summary returned five. Private photo/audio downloads worked. The officer was denied access to the unassigned case. Admin data access was denied before MFA, as required.

A live AI investigation readiness request failed in the server error handler because a PostgREST RPC builder was treated as a Promise with `.catch()`. The fix uses `try/await/catch` and a regression fixture matching the actual thenable shape. The failed demo run is marked failed rather than left processing. No fabricated AI response or model timing was seeded. Deploy the error-handler fix and rerun the live AI check before recording a model-success claim.
