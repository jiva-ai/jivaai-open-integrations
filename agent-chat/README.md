# Agent Chat

Agent Chat provides a conversational interface for interacting with Jiva.ai's agentic pipelines. This repository contains open-source SDKs and integration examples to help you build chat experiences powered by Jiva.ai's agent technology.

## What is Agent Chat?

Agent Chat is a chat-like interface that allows your product to interact with Jiva.ai's **Agentic Pipelines** - intelligent workflows that are automatically generated from goals you define. Unlike traditional chatbots, Agent Chat connects to dynamic, goal-driven pipelines that can adapt and execute complex tasks.

### Key Features

- **Conversational Interface**: Turn-based request/response interactions with intelligent agents
- **Goal-Driven**: Agents execute workflows based on your defined goals, not just predefined scripts
- **Flexible Integration**: API-based architecture lets you build your own UI and integrate seamlessly
- **Real-Time Updates**: WebSocket support for streaming updates as agents process requests
- **Asset Management**: Built-in support for file uploads and data collection during conversations
- **State Management**: Session-based conversations maintain context across multiple interactions

## How It Works

1. **Define Goals**: Create agent blueprints using Agent Goal nodes in the Jiva platform
2. **Generate Pipelines**: Jiva automatically generates agentic pipelines from your goals
3. **Chat Interface**: A special "Chat Interface" workflow is created for conversational interaction
4. **Integrate**: Use the provided SDKs to connect your product to the chat interface via API
5. **Customize**: Build your own UI and experience while leveraging Jiva's agent intelligence

## Language Integrations

This repository contains SDKs and examples for various programming languages. Each directory includes:

- **Type-safe SDKs**: Client libraries with full TypeScript/type definitions
- **Usage Examples**: Code samples demonstrating common use cases
- **Documentation**: Language-specific guides and API references
- **Tests**: Comprehensive test suites including unit, integration, and end-to-end tests

### Available Integrations

- **[TypeScript](./typescript/)**: Full-featured TypeScript SDK with comprehensive type definitions

*More language integrations coming soon!*

## Open Source & Commercial Use

This project is **entirely open source** and **free for commercial use**. You can:

- Use these SDKs in any project, commercial or personal
- Modify and extend the code to fit your needs
- Contribute improvements back to the community
- Build products and services on top of Jiva.ai's platform

## Getting Started

1. Choose your preferred language integration from the directories above
2. Follow the language-specific README for installation and setup instructions
3. Get your API credentials from the Jiva platform (workflow ID and API key)
4. Start building your chat experience!

## Learn More

For detailed API documentation, authentication, and advanced features, see the language-specific README files in each integration directory.

## Support

For questions, issues, or contributions, please refer to the main repository documentation or contact Jiva.ai support.

