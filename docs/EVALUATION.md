# Evaluation and dataset register

## Status

No field trial or dataset benchmark has been completed for this release. Software tests check permissions and workflow behavior, not agronomic correctness. Do not translate passing tests into an accuracy claim.

## Candidate sources

| Source                                                                                | Intended use                                           | Limitation                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [KaraAgro AI Maize](https://doi.org/10.7910/DVN/CXUMDS)                               | Ghana-relevant maize examples for a reviewed benchmark | Download, inspect labels, verify licence and group related photographs before use |
| [PlantVillage](https://github.com/spMohanty/PlantVillage-Dataset)                     | Supplementary controlled-image checks                  | Backgrounds and capture conditions differ from farm use                           |
| [PlantDoc](https://github.com/pratikkayal/PlantDoc-Dataset)                           | More varied imagery and failure analysis               | Check provenance, licence and applicability of each class                         |
| [FAO fall armyworm resource](https://www.fao.org/family-farming/detail/en/c/1112643/) | Background for systematic observation                  | Does not validate this app or establish a photo diagnosis                         |
| [CABI Plantwise](https://www.cabi.org/projects/plantwise/)                            | Advisory resource register                             | Local applicability and officer judgement are required                            |

These are candidate sources, not bundled datasets or completed experiments. Public images may already have appeared in foundation-model training. Avoid claiming an uncontaminated test set without evidence.

## Protocol

1. Freeze model, prompt and code versions before the final evaluation.
2. Separate development and evaluation cases. Keep related photographs, plants and capture sessions in the same split.
3. Have a qualified crop reviewer establish the expected observation category. Include unclear images, unrelated pictures and unsupported crops. Record disagreements.
4. Compare photo-and-message reporting with FarmRelay on the same task. Counterbalance reviewer order to reduce learning effects.
5. Record answered accuracy and coverage together. An abstention reduces coverage; do not hide it by reporting accuracy alone.
6. Have a reviewer mark unsupported claims. Report the reviewed denominator, not every uploaded case as if it was checked.
7. Measure review time, upload bytes, latency and interrupted-upload recovery separately. Use genuine network conditions and report the device and connection.
8. Publish sample sizes, failures and uncertainty. A faster review is not proof of better agronomic outcomes.

## Import format

The Evaluation page accepts a JSON array of 1 to 1,000 rows, under 1 MB. It also accepts its own exported report's `rows` field. Data stays in browser memory, with optional local download. It is not uploaded or saved to Supabase.

```json
[
  {
    "caseId": "synthetic-format-example",
    "expected": "unknown",
    "predicted": "unknown",
    "abstained": true
  }
]
```

The example demonstrates format only and is not a measured result.

Required: unique non-empty `caseId`, non-empty `expected` and `predicted` strings. Use exactly `unknown` for an unlabelled ground truth. Optional booleans: `abstained`, `unsupportedClaim`, `recoveredUpload`. Optional non-negative numbers: `reviewSeconds`, `baselineSeconds`, `elapsedMs`, `uploadBytes`.

Matching labels are exact and case-sensitive. Answered accuracy excludes `expected: "unknown"` and abstained rows. Coverage is answered labelled cases divided by all labelled cases. Missing time values are excluded from medians. Missing review/recovery flags are excluded from their denominators. Zero reviewed claims does not mean safety was demonstrated.

The page does not verify reviewer qualifications or dataset provenance. Keep a separate experiment manifest with image IDs, split, model, prompt, reviewer, connection and consent/licence details. Remove personal identifiers before sharing exports.
