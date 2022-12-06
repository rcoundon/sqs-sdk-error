import { MyStack } from './MyStack';
import { App } from '@serverless-stack/resources';

export default function (app: App) {
  app.setDefaultFunctionProps({
    runtime: 'nodejs16.x',
    architecture: 'arm_64',
    memorySize: 512,
    bundle: {
      format: 'esm',
      sourcemap: true,
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      THUNDRA_AGENT_TRACE_INTEGRATIONS_HTTP_RESPONSE_BODY_MASK: 'false',
      THUNDRA_AGENT_TRACE_SPAN_COUNT_MAX: '1000',
      THUNDRA_AGENT_REPORT_MAX_SIZE: '100000',
      THUNDRA_AGENT_TRACE_INSTRUMENT_ONLOAD: 'false',
      THUNDRA_AGENT_LAMBDA_ES_ENABLE: 'true',
      THUNDRA_AGENT_METRIC_DISABLE: 'false',
    },
  });
  app.stack(MyStack);
}
