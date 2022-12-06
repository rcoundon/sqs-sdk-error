import * as awsSdk3SmithyClient from '@aws-sdk/smithy-client';
import { instrumentModule } from '@thundra/core';

instrumentModule('@aws-sdk/smithy-client', awsSdk3SmithyClient);
