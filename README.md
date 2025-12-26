# Model Prices and Context Windows

A comprehensive database of AI model pricing, context windows, and capabilities across various providers.

## 🌐 Interactive Web Interface

**[View the interactive model browser →](https://maayanyosef.github.io/model_prices_and_context_windows/)**

Browse, search, and filter models with an easy-to-use web interface.

## 📊 Overview

This repository contains detailed information about AI models from multiple providers including:
- Pricing (input/output costs per token, image, audio, etc.)
- Context window sizes (max input/output tokens)
- Model capabilities (function calling, vision, audio, etc.)
- Provider information (OpenAI, Anthropic, AWS Bedrock, Google, etc.)
- Deprecation dates and supported regions

## 📁 Data Structure

The main data file is `model_prices_and_context_windows.json`, which contains a JSON object where:
- **Keys**: Model identifiers (e.g., `gpt-4`, `claude-3-opus-20240229`)
- **Values**: Objects containing model metadata

### Common Fields

| Field | Description | Example |
|-------|-------------|---------|
| `litellm_provider` | The LLM provider | `"openai"`, `"anthropic"`, `"bedrock"` |
| `mode` | Model type | `"chat"`, `"embedding"`, `"image_generation"` |
| `max_tokens` | Maximum context window | `128000` |
| `max_input_tokens` | Maximum input tokens | `128000` |
| `max_output_tokens` | Maximum output tokens | `4096` |
| `input_cost_per_token` | Cost per input token | `0.000003` |
| `output_cost_per_token` | Cost per output token | `0.000015` |

### Capability Fields (boolean)

- `supports_function_calling` - Tool/function calling support
- `supports_vision` - Image input support
- `supports_audio_input` - Audio input support
- `supports_audio_output` - Audio output support
- `supports_system_messages` - System message support
- `supports_prompt_caching` - Prompt caching support
- `supports_reasoning` - Chain-of-thought reasoning support
- `supports_response_schema` - Structured output support
- `supports_web_search` - Web search capabilities

### Cost Fields by Type

**Token-based**:
- `input_cost_per_token`
- `output_cost_per_token`
- `cache_creation_input_token_cost`
- `cache_read_input_token_cost`
- `output_cost_per_reasoning_token`

**Media-based**:
- `input_cost_per_image`
- `output_cost_per_image`
- `input_cost_per_audio_token`
- `input_cost_per_second` (audio transcription)
- `input_cost_per_video_per_second`

**Other**:
- `file_search_cost_per_1k_calls`
- `file_search_cost_per_gb_per_day`
- `vector_store_cost_per_gb_per_day`

## 💻 Usage Examples

### Python

```python
import json

# Load the data
with open('model_prices_and_context_windows.json', 'r') as f:
    models = json.load(f)

# Find all chat models from OpenAI
openai_chat_models = {
    name: info for name, info in models.items()
    if info.get('litellm_provider') == 'openai' and info.get('mode') == 'chat'
}

# Calculate cost for 1M tokens
model_name = 'gpt-4'
model = models[model_name]
input_cost = model['input_cost_per_token'] * 1_000_000
output_cost = model['output_cost_per_token'] * 1_000_000
print(f"{model_name} - Input: ${input_cost:.2f}, Output: ${output_cost:.2f} per 1M tokens")
```

### JavaScript

```javascript
// Fetch and use the data
fetch('model_prices_and_context_windows.json')
  .then(response => response.json())
  .then(models => {
    // Filter models with vision support
    const visionModels = Object.entries(models)
      .filter(([_, info]) => info.supports_vision)
      .map(([name, _]) => name);
    
    console.log('Vision-capable models:', visionModels);
  });
```

### TypeScript

```typescript
interface ModelInfo {
  litellm_provider?: string;
  mode?: string;
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  supports_function_calling?: boolean;
  supports_vision?: boolean;
  supports_reasoning?: boolean;
  // ... other fields
}

type ModelsDatabase = Record<string, ModelInfo>;

// Load and type the data
import modelsData from './model_prices_and_context_windows.json';
const models: ModelsDatabase = modelsData;

// Find cheapest chat model
const chatModels = Object.entries(models)
  .filter(([_, info]) => info.mode === 'chat' && info.input_cost_per_token)
  .sort((a, b) => a[1].input_cost_per_token! - b[1].input_cost_per_token!);

console.log('Cheapest chat model:', chatModels[0][0]);
```

## 🔍 Example Queries

### Find models with specific capabilities

```python
# Models with both vision and function calling
vision_and_tools = [
    name for name, info in models.items()
    if info.get('supports_vision') and info.get('supports_function_calling')
]

# Models with >100K context window
large_context = [
    name for name, info in models.items()
    if info.get('max_input_tokens', 0) > 100000
]

# Most cost-effective embedding models
embeddings = sorted(
    [(name, info.get('input_cost_per_token', float('inf'))) 
     for name, info in models.items() 
     if info.get('mode') == 'embedding'],
    key=lambda x: x[1]
)
```

## 🏗️ Model Modes

The `mode` field indicates the model's primary function:

- `chat` - Text generation and conversation
- `embedding` - Vector embeddings for semantic search
- `image_generation` - Text-to-image generation
- `audio_transcription` - Speech-to-text
- `audio_speech` - Text-to-speech
- `completion` - Text completion (legacy)
- `moderation` - Content moderation
- `rerank` - Document reranking
- `search` - Search functionality

## 📚 Provider Coverage

The database includes models from:
- OpenAI (GPT-4, GPT-3.5, DALL-E, Whisper, etc.)
- Anthropic (Claude models)
- Google (Gemini, PaLM)
- AWS Bedrock (Multiple providers)
- Azure OpenAI
- Cohere
- AI21 Labs
- Replicate
- Together AI
- Fireworks AI
- Groq
- Mistral AI
- And many more...

## 🤝 Contributing

Contributions are welcome! To add or update model information:

1. Fork the repository
2. Update `model_prices_and_context_windows.json`
3. Ensure the JSON is valid and follows the existing structure
4. Submit a pull request with a description of changes

### Data Guidelines

- Use scientific notation for small decimals (e.g., `1e-06` instead of `0.000001`)
- Include `source` field with documentation URLs when available
- Add `deprecation_date` in `YYYY-MM-DD` format for deprecated models
- Use consistent naming conventions matching the provider's official names

## 📝 License

This data is provided for informational purposes. Please verify pricing and capabilities with official provider documentation before making business decisions.

## 🔗 Related Projects

This database is designed to work with [LiteLLM](https://github.com/BerriAI/litellm) and similar LLM abstraction libraries.

## ⚠️ Disclaimer

Model pricing and capabilities change frequently. While we strive to keep this database up-to-date, always verify current pricing and features with the official provider documentation.

Last updated: December 2024