# Dev Log Plugin

Creates a continuous development and decision logging capability to your repository.

## Overview

The Dev Log Plugin provides tools for tracking your development process, decisions, and project roadmap in a structured way within your repository.

## Features

- **Development Logging** (`devlog.ts`) - Log development activities and progress
- **Decision Tracking** - Record and maintain decision history
- **Roadmap Management** - Plan and track project milestones
- **Snapshots** - Capture project state at key points

## Installation

Copy this directory to your Claude plugins configuration.

## Configuration

The plugin uses hooks to initialize on session start:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts context",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## Usage

Once installed, the plugin will automatically initialize on Claude startup and provide development logging capabilities.

## Files

- `scripts/devlog.ts` - Main entry point for the dev log functionality
- `skills/dev-roadmap/` - Roadmap management skill
- `hooks/hooks.json` - Plugin hooks configuration

## Version

1.0.0
