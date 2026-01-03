# Claude Code Skills

This directory contains reusable optimization skills for development workflows.

## Available Skills

### 🚀 astro-performance-optimization.md

Complete Astro website performance optimization guide for achieving 95-100 Lighthouse mobile scores.

**Coverage:**
- Font optimization (variable fonts + system fonts)
- CSS inline strategy (eliminate render-blocking)
- JavaScript reduction (remove non-critical code)
- Image optimization (responsive srcset)
- Sitemap implementation with i18n
- Complete checklist and troubleshooting

**Use when:**
- PageSpeed Insights shows performance issues
- Mobile Lighthouse score < 90
- Render-blocking resources detected
- Large JavaScript bundles (>100KB)
- Missing sitemap

**Expected results:**
- ~60-70% payload reduction
- Lighthouse score: 95-100 (mobile)
- Font payload: -74%
- JavaScript: -50%
- CSS blocking: -100%

## How to Use Skills

### In Claude Code:

Skills are automatically available in Claude Code. Reference them in conversations:

```
"Use the astro-performance-optimization skill to optimize this project"
```

### In Other Projects:

Copy the skill file to your project's `.claude/skills/` directory:

```bash
mkdir -p .claude/skills
cp /path/to/beautyflow/.claude/skills/astro-performance-optimization.md .claude/skills/
```

## Skill Structure

Each skill follows this structure:
1. **Description** - What the skill does
2. **When to Use** - Trigger conditions
3. **Prerequisites** - Requirements
4. **Step-by-Step Guide** - Detailed implementation
5. **Checklist** - Verification steps
6. **Expected Results** - Performance metrics
7. **Troubleshooting** - Common issues
8. **Resources** - Additional reading

## Contributing

To create new skills:
1. Create `.claude/skills/your-skill-name.md`
2. Follow the structure above
3. Test thoroughly on real projects
4. Document expected results with metrics

## Version History

- **2026-01**: Initial skill collection
  - astro-performance-optimization v1.0
