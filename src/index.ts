#!/usr/bin/env node
import { Command } from 'commander';
import { generateMcpProject } from './generator/mcp';
import * as fs from 'fs';
import * as readline from 'readline';
import SwaggerParser from '@apidevtools/swagger-parser';

import { semanticMatch } from './semantic/search';

const program = new Command();

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

program
  .name('generate-rc-mcp')
  .description('Gemini CLI Extension to generate a secure, scoped Rocket.Chat MCP server based on specific workflow operations.')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate the MCP Server from OpenAPI definitions')
  .option('-s, --spec <file>', 'Path to Rocket.Chat OpenAPI spec (JSON/YAML)', 'merged-openapi.json')
  .option('-w, --workflows <items>', 'Comma separated list of workflows to include (e.g. "provisionChannel,broadcastMessage")', 'provisionChannel,broadcastMessage')
  .option('-o, --outDir <dir>', 'Output directory for the generated server', './out-mcp')
  .option('-i, --interactive', 'Run in interactive mode to let Gemini suggest workflows based on your use case')
  .action(async (options) => {
    try {
      const path = require('path');
      const specPath = options.spec === 'merged-openapi.json' ? path.join(__dirname, '..', options.spec) : path.resolve(process.cwd(), options.spec);
      console.log(`\\nParsing and resolving $refs in OpenAPI Spec (${specPath}) ...`);
      const openapi = await SwaggerParser.dereference(specPath);
      
      let workflows = options.workflows.split(/[, ]+/).map((w: string) => w.trim()).filter(Boolean);

      if (options.interactive) {
        console.log('\n✨ Welcome to the Gemini AI Rocket.Chat Server Generator ✨\n');
        const useCase = await askQuestion('Describe your use case for this MCP server (e.g. "I want to broadcast community announcements"): ');
        workflows = semanticMatch(useCase);
        
        console.log(`\n🤖 Gemini analyzed your use case and recommends the following capabilities:`);
        workflows.forEach((w: string) => console.log(`   - ${w}`));
        
        const confirm = await askQuestion('\nDo you want to proceed and generate the server with these capabilities? (Y/n): ');
        if (confirm.toLowerCase() === 'n' || confirm.toLowerCase() === 'no') {
          console.log('Aborted generation.');
          process.exit(0);
        }
      }

      console.log(`\nAnalyzing API AST...`);
      console.log(`Isolating features for workflows: ${workflows.join(', ')}`);
      
      generateMcpProject(openapi, workflows, options.outDir);
      console.log(`\nSuccess! Your scoped MCP server was generated in '${options.outDir}'.`);
      
      console.log(`⏳ Automatically executing build and configuring dependencies in '${options.outDir}'...`);
      const { execSync } = require('child_process');
      try {
        execSync('npm install', { cwd: options.outDir, stdio: 'pipe' }); // stdio pipe to reduce noise
        execSync('npm run build', { cwd: options.outDir, stdio: 'pipe' });
        console.log(`✅ Build complete! Server is fully compiled and ready to test.`);
      } catch (buildErr: any) {
        console.error('❌ Automatic build failed. You may need to run "npm run build" manually in the generated folder.');
        console.error(buildErr.message);
      }
      
    } catch(err) {
      console.error(err);
      process.exit(1);
    }
  });

program
  .command('install')
  .description('Install the generated MCP server into Claude Desktop config')
  .option('--mcp-dir <dir>', 'Path to the generated out-mcp directory', './out-mcp')
  .option('--rc-url <url>', 'Rocket.Chat server URL', 'http://localhost:3000')
  .option('--rc-user-id <id>', 'Rocket.Chat User ID', process.env.RC_USER_ID || '')
  .option('--rc-auth-token <token>', 'Rocket.Chat Auth Token', process.env.RC_AUTH_TOKEN || '')
  .action((options) => {
    const path = require('path');
    const fs = require('fs');
    const os = require('os');

    const serverPath = path.resolve(options.mcpDir, 'build', 'server.js');
    if (!fs.existsSync(serverPath)) {
      console.error(`\n❌ Server not found at: ${serverPath}`);
      console.error('   Run "gemini generate -i" first to generate the MCP server.');
      process.exit(1);
    }

    const claudeConfigDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Claude');
    const claudeConfigPath = path.join(claudeConfigDir, 'claude_desktop_config.json');

    let config: any = { mcpServers: {} };
    if (fs.existsSync(claudeConfigPath)) {
      try {
        config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
        if (!config.mcpServers) config.mcpServers = {};
      } catch (e) {
        console.warn('⚠️  Existing config was invalid JSON, overwriting.');
        config = { mcpServers: {} };
      }
    } else {
      fs.mkdirSync(claudeConfigDir, { recursive: true });
    }

    if (!options.rcUserId || !options.rcAuthToken) {
      console.error('\n❌ ERROR: RC_USER_ID and RC_AUTH_TOKEN are required.');
      console.error('   Set them via env vars or pass --rc-user-id and --rc-auth-token flags.');
      process.exit(1);
    }

    config.mcpServers['rocketchat'] = {
      command: 'node',
      args: [serverPath],
      env: {
        RC_URL: options.rcUrl,
        RC_USER_ID: options.rcUserId,
        RC_AUTH_TOKEN: options.rcAuthToken
      }
    };

    fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
    console.log(`\n✅ Rocket.Chat MCP server installed into Claude Desktop!`);
    console.log(`   Config written to: ${claudeConfigPath}`);
    console.log(`   Server path: ${serverPath}`);
    console.log(`   RC URL: ${options.rcUrl}`);
    console.log(`\n🔄 Restart Claude Desktop to apply changes.`);
    console.log(`   Look for the 🔨 hammer icon in the chat box to confirm tools are loaded.\n`);
  });

program
  .command('chat')
  .description('Connect to an MCP server and test a prompt via JSON-RPC')
  .requiredOption('--mcp <command>', 'Command to start the MCP server')
  .requiredOption('--prompt <text>', 'The test prompt to evaluate')
  .action(async (options) => {
    console.log(`\\n🤖 Launching internal testing tool for: ${options.mcp}`);
    console.log(`💬 Evaluating Prompt: "${options.prompt}"\\n`);
    
    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

      const rawCmd = options.mcp.trim().split(' ');
      const cmd = rawCmd[0];
      const args = rawCmd.slice(1).map((s: string) => s.replace(/^"|"$/g, ''));

      const transport = new StdioClientTransport({
        command: cmd,
        args: args,
        stderr: "inherit",
        env: { ...process.env } as Record<string, string>
      });
      
      const client = new Client({ name: "gemini-tester", version: "1.0.0" }, { capabilities: {} });
      await client.connect(transport);

      let fallbackTool = "chat_postMessage";
      let fallbackArgs: any = { channel: "#general", text: options.prompt };
      
      if (options.prompt.toLowerCase().includes('hello world')) {
          fallbackTool = "chat_postMessage";
          fallbackArgs = { channel: "#general", text: "Hello from the Gemini CLI MCP server!" };
      } else if (options.prompt.toLowerCase().includes('kick') || options.prompt.toLowerCase().includes('remove')) {
          fallbackTool = "channels_kick";
          fallbackArgs = { roomId: "GENERAL", userId: "rocket.cat" };
      } else if (options.prompt.toLowerCase().includes('add') || options.prompt.toLowerCase().includes('invite')) {
          fallbackTool = "channels_invite";
          fallbackArgs = { roomId: "GENERAL", userId: "rocket.cat" };
      }

      console.log(`🔄 Simulated LLM routing to MCP Tool Action: ${fallbackTool}`);
      console.log(`arg mapping:`, fallbackArgs);
      
      try {
          const fetchRes = await client.callTool({ name: fallbackTool, arguments: fallbackArgs });
          console.log("\\n✅ Tool Execution Successful!");
          console.dir(fetchRes, { depth: null });
          process.exit(0);
      } catch(e: any) {
           console.error("\\n❌ Tool Execution Failed:", e.message || e);
           process.exit(1);
      }
    } catch(err: any) {
       console.error("\\n❌ Client Setup Error:", err.message || err);
       process.exit(1);
    }
  });

program.parse(process.argv);
