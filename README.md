# Metanoia Plugin Marketplace

A collection of independently installable Claude plugins for enhanced development workflows.

## Available Plugins

### dev-log-plugin
Creates a continuous development and decision logging capability to your repository.

- **Location:** `plugins/dev-log-plugin/`
- **Version:** 1.0.0
- **Features:**
  - Development logging
  - Decision tracking
  - Roadmap management
  - Snapshot capabilities

### quality-review-plugin
Adds a quality-review skill for quick code reviews.

- **Location:** `plugins/quality-review-plugin/`
- **Version:** 1.0.0

## Installation

Each plugin can be installed independently to your Claude configuration. To install a plugin:

1. Locate the plugin directory (e.g., `plugins/dev-log-plugin/`)
2. Copy the entire plugin directory to your Claude plugins directory
3. The plugin's `.claude-plugin/plugin.json` file contains metadata for installation

### File Structure
Each plugin follows this structure:
```
plugin-name/
├── .claude-plugin/
│   └── plugin.json           # Plugin metadata (required)
├── hooks/                    # Optional: Claude hooks
│   └── hooks.json
├── scripts/                  # Optional: Plugin scripts
├── skills/                   # Optional: Claude skills
└── [other plugin files]
```

## Adding New Plugins

To add a new plugin to the marketplace:

1. Create a new directory under `plugins/your-plugin-name/`
2. Create the required `.claude-plugin/plugin.json` file with plugin metadata
3. Add any supporting files (hooks, scripts, skills) in their respective directories
4. Update this README with the new plugin information

## License

See LICENSE file for details.
