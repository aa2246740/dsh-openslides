# Generated direction decks (oracle evidence)

Playbook-generated PPTD v2 used for official iframe A/B. Same YAML is loaded in:

- official neo-ppt via compare-host Penpal `setPPTD`
- native pane via `canvas-session` `renderModel`

| Id | Brief | Design system | Category |
|----|-------|---------------|----------|
| `ab-consulting` | 华北区域渠道增长复盘 | `consulting/pine-green-strategy` | `analysis-decision` |
| `ab-academic` | Transformer 注意力机制导论 | `academic/deep-blue-atlas` | `academic-research` |
| `ab-promo` | 夏季限定系列发布 | `promotion/cream-collage` | `brand-creative` |
| `ab-work` | 边缘推理平台路线图 | `work/electric-violet-business` | `tech-engineering` |

Regenerate (does not overwrite this folder unless copied):

```bash
npm run native:generate -- "brief" -o ./output/ab-consulting --no-export \
  --design consulting/pine-green-strategy --category analysis-decision
```

These are structural playbook decks (placeholder chart numbers), not official Agent research. Production does not embed the Kimi iframe.
