export function parseWorkflowsToApis(spec: any, workflows: string[]) {
  const result: any = {};
  
  // A simplistic engine to map elevated workflows -> raw APIs
  const WORKFLOW_API_MAP: Record<string, string[]> = {
    "provisionChannel": ["channels.create", "users.invite"],
    "broadcastMessage": ["chat.postMessage"],
    "onboardUser": ["users.create", "channels.invite"],
    "communityAnnouncement": ["chat.postMessage"],
    "kickUser": ["channels.kick"]
  };

  for (const workflow of workflows) {
    const apiIds = WORKFLOW_API_MAP[workflow];
    if (apiIds) {
      for (const apiId of apiIds) {
        // Find matching API path in OpenAPI specs
        for (const [path, methods] of Object.entries(spec.paths || {})) {
          const postOp = (methods as any).post;
          if (postOp && postOp.operationId && postOp.operationId.endsWith(apiId)) {
            result[apiId] = {
              path,
              schema: postOp.requestBody?.content?.['application/json']?.schema
            };
          }
        }
      }
    }
  }
  return result;
}
