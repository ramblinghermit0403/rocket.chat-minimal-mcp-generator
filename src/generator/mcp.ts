import * as fs from 'fs';
import * as path from 'path';
import { parseWorkflowsToApis } from '../parser/openapi';

export function generateMcpProject(openapiSpec: any, workflows: string[], outDir: string) {
  const requiredApis = parseWorkflowsToApis(openapiSpec, workflows);
  
  if (Object.keys(requiredApis).length === 0) {
    throw new Error('No APIs resolved from the provided workflows and spec.');
  }

  // Scaffolding Code
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'tests'), { recursive: true });

  const pkg = {
    name: "rocket-chat-scoped-mcp",
    version: "1.0.0",
    type: "module",
    scripts: {
      "build": "tsc",
      "start": "node build/server.js",
      "test": "node tests/runner.js"
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.5.0",
      "zod": "^3.22.4"
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      "typescript": "^5.0.0"
    }
  };
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

  const tsConfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: "./build",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true
    },
    include: ["src/**/*"]
  };
  fs.writeFileSync(path.join(outDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));

  generateToolsMapping(workflows, requiredApis, path.join(outDir, 'src', 'server.ts'));
  generateTestSuites(workflows, path.join(outDir, 'tests'));
}

function generateToolsMapping(workflows: string[], apiSpecs: any, target: string) {
  let content = `import { Server } from "@modelcontextprotocol/sdk/server/index.js";\n`;
  content += `import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";\n`;
  content += `import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";\n\n`;

  content += `// -----------------------------------------------------\n`;
  content += `// SECURITY CHECKS -- ENFORCED MCP PARAMETERS\n`;
  content += `// -----------------------------------------------------\n`;
  content += `const RC_URL = process.env.RC_URL || 'http://localhost:3000';\n`;
  content += `const RC_USER_ID = process.env.RC_USER_ID;\n`;
  content += `const RC_AUTH_TOKEN = process.env.RC_AUTH_TOKEN;\n\n`;

  content += `if (!RC_USER_ID || !RC_AUTH_TOKEN) {\n`;
  content += `  console.error("WARNING: Missing RC_USER_ID or RC_AUTH_TOKEN. This server requires credentials.");\n`;
  content += `}\n\n`;

  content += `const getHeaders = () => ({\n`;
  content += `  'Content-Type': 'application/json',\n`;
  content += `  'X-User-Id': RC_USER_ID as string,\n`;
  content += `  'X-Auth-Token': RC_AUTH_TOKEN as string,\n`;
  content += `});\n\n`;

  content += `const server = new Server({ name: "scaffolded-rc-mcp-live", version: "1.0.0" }, { capabilities: { tools: {} } });\n\n`;

  content += `const toolDefinitions = [\n`;
  for (const [apiId, apiInfo] of Object.entries(apiSpecs)) {
    const rawSchema = (apiInfo as any).schema || { type: "object", properties: {} };
    // Flatten dereferenced schema to JSON string for the generated output
    const schemaStr = JSON.stringify(rawSchema, null, 4).replace(/\n/g, '\n    ');
    const safeName = apiId.replace(/[^a-zA-Z0-9_-]/g, '_');
    content += `  {
    name: "${safeName}",
    description: "Auto-generated tool for Rocket.Chat API: ${apiId}",
    inputSchema: ${schemaStr}
  },\n`;
  }
  content += `];\n\n`;

  content += `const toolPaths: Record<string, string> = {\n`;
  for (const [apiId, apiInfo] of Object.entries(apiSpecs)) {
    const safeName = apiId.replace(/[^a-zA-Z0-9_-]/g, '_');
    content += `  "${safeName}": "${(apiInfo as any).path}",\n`;
  }
  content += `};\n\n`;

  content += `server.setRequestHandler(ListToolsRequestSchema, async () => { return { tools: toolDefinitions }; });\n\n`;

  content += `server.setRequestHandler(CallToolRequestSchema, async (request) => {\n`;
  content += `  const { name, arguments: args } = request.params;\n`;
  content += `  console.error('[Operation] Executing LIVE workflow: ', name, 'with', args);\n\n`;

  content += `  try {\n`;
  content += `    const endpointPath = toolPaths[name];
    if (!endpointPath) throw new Error('Unknown tool: ' + name);

    const res = await fetch(\`\${RC_URL}\${endpointPath}\`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(args || {})
    });
    
    // Some endpoints return empty body on success (200 OK)
    const resText = await res.text();
    let jsonres = {};
    if (resText) {
      try { jsonres = JSON.parse(resText); } catch(e) {}
    }

    if(!res.ok) throw new Error(JSON.stringify(jsonres) || resText);
    return { content: [{ type: "text", text: \`API Request Successful: \${JSON.stringify(jsonres)}\` }] };\n`;
  content += `  } catch (err: any) {\n`;
  content += `    console.error('LIVE API ERROR:', err.message);\n`;
  content += `    return { isError: true, content: [{ type: "text", text: \`API Request Failed: \${err.message}\`}] }; \n`;
  content += `  }\n`;
  content += `});\n\n`;

  content += `async function run() {\n`;
  content += `  const transport = new StdioServerTransport();\n`;
  content += `  await server.connect(transport);\n`;
  content += `  console.error(\`LIVE Rocket.Chat MCP Server running on stdio (Targeting \${RC_URL})\`);\n`;
  content += `}\n`;
  content += `run().catch(console.error);\n`;

  fs.writeFileSync(target, content);
}

function generateTestSuites(workflows: string[], testDir: string) {
  let runScript = `import { spawn } from 'child_process';\n`;
  runScript += `import path from 'path';\n`;
  runScript += `import { fileURLToPath } from 'url';\n\n`;
  runScript += `const __dirname = path.dirname(fileURLToPath(import.meta.url));\n`;
  runScript += `const serverProcess = spawn('node', [path.resolve(__dirname, '../build/server.js')], { env: process.env });\n\n`;
  
  runScript += `serverProcess.stdout.on('data', (data) => {\n`;
  runScript += `  const str = data.toString();\n`;
  runScript += `  if(str.includes('delivered to Rocket.Chat') || str.includes('Channel created successfully')) {\n`;
  runScript += `    console.log('✅ LIVE Workflow Passed against Server:', str.trim());\n`;
  runScript += `    setTimeout(() => { serverProcess.kill(); process.exit(0); }, 500);\n`;
  runScript += `  } else if (str.includes('API Request Failed') || str.includes('Error')) {\n`;
  runScript += `    console.error('❌ Action Failed (Are tokens set?):', str.trim());\n`;
  runScript += `    setTimeout(() => { serverProcess.kill(); process.exit(1); }, 500);\n`;
  runScript += `  }\n`;
  runScript += `});\n\n`;
  runScript += `serverProcess.stderr.on('data', d => console.error(d.toString()));\n\n`;

  runScript += `const callMessage = {\n`;
  runScript += `  jsonrpc: "2.0", id: 1, method: "tools/call",\n`;
  runScript += `  params: { name: "chat_postMessage", arguments: { channel: "#general", text: "Hello from the LLM via live MCP!" } }\n`;
  runScript += `};\n`;

  runScript += `setTimeout(() => { serverProcess.stdin.write(JSON.stringify(callMessage) + '\\n'); }, 1000);\n`;

  fs.writeFileSync(path.join(testDir, 'runner.js'), runScript);
}
