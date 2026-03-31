import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const OPENAPI_DIR = path.resolve(__dirname, '../../Rocket.Chat-Open-API');
const OUTPUT_FILE = path.resolve(__dirname, '../merged-openapi.json');

function mergeSpecs() {
  if (!fs.existsSync(OPENAPI_DIR)) {
    console.error(`Directory not found: ${OPENAPI_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(OPENAPI_DIR).filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
  
  if (files.length === 0) {
    console.error(`No YAML files found in ${OPENAPI_DIR}`);
    process.exit(1);
  }

  const merged: any = {
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'Rocket.Chat API',
      description: 'Merged Rocket.Chat REST API documentation'
    },
    servers: [],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {},
      parameters: {},
      responses: {}
    }
  };

  const serversSet = new Set<string>();

  for (const file of files) {
    const filePath = path.join(OPENAPI_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const doc = yaml.load(content) as any;
      
      if (!doc || typeof doc !== 'object') continue;

      // Merge Servers
      if (Array.isArray(doc.servers)) {
        for (const server of doc.servers) {
          if (server.url && !serversSet.has(server.url)) {
            serversSet.add(server.url);
            merged.servers.push(server);
          }
        }
      }

      // Merge Paths
      if (doc.paths && typeof doc.paths === 'object') {
        for (const [p, pathItem] of Object.entries(doc.paths)) {
          if (!merged.paths[p]) {
            merged.paths[p] = {};
          }
          Object.assign(merged.paths[p], pathItem);
        }
      }

      // Merge Components
      if (doc.components && typeof doc.components === 'object') {
        const types = ['schemas', 'securitySchemes', 'parameters', 'responses'];
        for (const type of types) {
          if (doc.components[type]) {
            merged.components[type] = {
              ...merged.components[type],
              ...doc.components[type]
            };
          }
        }
      }

    } catch (err) {
      console.error(`Error parsing ${file}:`, err);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Successfully merged ${files.length} files into ${OUTPUT_FILE}`);
}

mergeSpecs();
