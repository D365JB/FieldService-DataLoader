// Field Service Data Studio — main infra (resource-group-scoped).
//
// Architecture: Flex Consumption Functions + Managed Identity + SWA.
//
// Why Flex Consumption: this subscription has 0 quota for Y1 Dynamic and
// 0 quota for B1/Basic VMs. Flex Consumption (FC1) uses its own per-region
// 250-core quota, separate from those families.
//
// Why Managed Identity: tenant policy forces AOAI disableLocalAuth=true,
// so no API keys are available — Function App MI is the only path.

targetScope = 'resourceGroup'

@description('Name token used as a prefix for all resource names. Lower-case, 3-12 chars.')
@minLength(3)
@maxLength(12)
param environmentName string

@description('Primary location.')
param location string = resourceGroup().location

@description('SWA location.')
@allowed([
  'centralus'
  'eastus2'
  'eastasia'
  'westeurope'
  'westus2'
])
param swaLocation string = 'eastus2'

@description('AOAI location.')
@allowed([
  'eastus'
  'eastus2'
  'swedencentral'
  'westus'
  'westus3'
])
param openAiLocation string = 'eastus2'

@description('Origin(s) allowed to call the API. Comma-separated. The deployed SWA URL is appended automatically.')
param extraAllowedOrigins string = 'http://localhost:5173'

@description('AOAI deployment name (active model the API talks to).')
param openAiDeploymentName string = 'gpt-4o-mini'

@description('AOAI model name (must match openAiDeploymentName for clarity).')
param openAiModelName string = 'gpt-4o-mini'

@description('AOAI model version.')
param openAiModelVersion string = '2024-07-18'

@description('Optional fallback deployment (e.g. gpt-5-mini). Provisioned alongside the primary so we can flip AOAI_DEPLOYMENT via app setting without redeploying. Leave model name blank to skip.')
param openAiFallbackDeploymentName string = 'gpt-5-mini'
param openAiFallbackModelName string = 'gpt-5-mini'
param openAiFallbackModelVersion string = '2025-08-07'

@description('AOAI deployment SKU capacity (TPM in thousands).')
param openAiCapacity int = 100

@description('Fallback deployment capacity. Matches primary so a flip via app setting has full headroom.')
param openAiFallbackCapacity int = 100

@description('Shared access key the SPA must send as `x-app-key` on every /api/* call. The whole proxy is locked behind this — leave at default to keep the function failing closed until you set it explicitly via `az functionapp config appsettings set`. Marked secure so it never leaks into ARM history.')
@secure()
param appAccessKey string = ''

@description('Email address to notify when the /api/health availability test fails. Leave empty to skip alert provisioning entirely.')
param alertEmail string = ''

var tags = {
  'azd-env-name': environmentName
}

var nameSuffix = uniqueString(resourceGroup().id, environmentName)

// ── Log Analytics + App Insights ──────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${environmentName}-${nameSuffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${environmentName}-${nameSuffix}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ── Azure OpenAI (key auth disabled per tenant policy) ────────────────────
resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'aoai-${environmentName}-${nameSuffix}'
  location: openAiLocation
  tags: tags
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'aoai-${environmentName}-${nameSuffix}'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource openAiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: openAiDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: openAiCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelName
      version: openAiModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// Fallback deployment kept on standby. Flip the function app's
// AOAI_DEPLOYMENT setting to this name to swap models in ~30s with no
// redeploy. Smaller capacity since it shouldn't be carrying production
// traffic. `dependsOn` serializes the two deployments — AOAI returns 409
// "already in progress" if both creates run in parallel against the same
// account.
resource openAiFallbackDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: openAiFallbackDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: openAiFallbackCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiFallbackModelName
      version: openAiFallbackModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
  dependsOn: [
    openAiDeployment
  ]
}

// ── Storage account (required by Functions runtime + deployment package) ──
var storageNameRaw = toLower('st${environmentName}${nameSuffix}')
var storageName = length(storageNameRaw) > 24 ? substring(storageNameRaw, 0, 24) : storageNameRaw

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  #disable-next-line BCP335
  name: storageName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

var deploymentContainerName = 'deployment'

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

// ── Flex Consumption plan (FC1) ───────────────────────────────────────────
resource functionPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${environmentName}-${nameSuffix}'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  sku: {
    tier: 'FlexConsumption'
    name: 'FC1'
  }
  properties: {
    reserved: true
  }
}

var functionAppName = 'func-${environmentName}-${nameSuffix}'

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'api' })
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: functionPlan.id
    httpsOnly: true
    siteConfig: {
      // Flex Consumption: linuxFxVersion is set via functionAppConfig.runtime,
      // NOT via siteConfig.linuxFxVersion. Most legacy Functions appSettings
      // (FUNCTIONS_EXTENSION_VERSION, WEBSITE_NODE_DEFAULT_VERSION,
      // FUNCTIONS_WORKER_RUNTIME, WEBSITE_CONTENT*) are deprecated here.
      cors: {
        allowedOrigins: union(
          [ 'https://${staticWebApp.properties.defaultHostname}' ],
          split(extraAllowedOrigins, ',')
        )
        supportCredentials: false
      }
      appSettings: [
        // Identity-based AzureWebJobsStorage (storage account has shared-key
        // auth disabled by Azure Policy). The Function App MI must hold
        // Storage Blob Data Owner + Queue Data Contributor + Table Data
        // Contributor on the storage account (granted below).
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storage.name
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'AOAI_ENDPOINT'
          value: openAi.properties.endpoint
        }
        {
          name: 'AOAI_DEPLOYMENT'
          value: openAiDeploymentName
        }
        {
          // Comma-separated allowlist of deployments the client may pick via
          // the `model` field on /api/generateContent. The /api/models
          // endpoint also returns this list. Keep in sync with the actual
          // openAiDeployment{,Fallback}Name params above.
          name: 'AOAI_ALLOWED_DEPLOYMENTS'
          value: empty(openAiFallbackDeploymentName) ? openAiDeploymentName : '${openAiDeploymentName},${openAiFallbackDeploymentName}'
        }
        {
          name: 'AOAI_API_VERSION'
          value: '2024-10-21'
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: 'https://${staticWebApp.properties.defaultHostname},${extraAllowedOrigins}'
        }
        {
          // Tenant-free shared-secret gate. The SPA prompts the user once
          // and includes this on every /api/* request as `x-app-key`. The
          // function fails closed when this is empty, so the very first
          // deploy is locked until you set it via:
          //   az functionapp config appsettings set -n <func> -g <rg> --settings APP_ACCESS_KEY=<value>
          // (Setting it as a Bicep param is supported but optional — most
          // operators just rotate it directly on the Function App.)
          name: 'APP_ACCESS_KEY'
          value: appAccessKey
        }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        // v1.42.7 — keep one instance always warm so the Brand / Analyze
        // pages don't see cold-start 503s the first time a dispatcher
        // hits them after an idle period. Costs roughly $8–15/mo for one
        // FC1 vCPU; eliminates the most-reported transient error.
        alwaysReady: [
          {
            name: 'http'
            instanceCount: 1
          }
        ]
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'node'
        version: '20'
      }
    }
  }
  dependsOn: [
    deploymentContainer
  ]
}

// ── Static Web App ────────────────────────────────────────────────────────
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-${environmentName}-${nameSuffix}'
  location: swaLocation
  tags: union(tags, { 'azd-service-name': 'web' })
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    repositoryUrl: ''
    branch: ''
    buildProperties: {
      appLocation: 'web'
      apiLocation: ''
      outputLocation: 'dist'
    }
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    provider: 'Custom'
  }
}

// ── Linked backend (SWA /api → Function App) ──────────────────────────────
resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: staticWebApp
  name: 'default'
  properties: {
    backendResourceId: functionApp.id
    region: location
  }
}

// ── Roles ─────────────────────────────────────────────────────────────────
// Function App MI → "Cognitive Services OpenAI User" on AOAI
var openAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource funcOpenAiAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: openAi
  name: guid(openAi.id, functionApp.id, openAiUserRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      openAiUserRoleId
    )
  }
}

// Function App MI → "Storage Blob Data Owner" on storage (deployment package access)
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'

resource funcStorageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageBlobDataOwnerRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobDataOwnerRoleId
    )
  }
}

// Function App MI → "Storage Queue Data Contributor" (AzureWebJobsStorage queues)
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'

resource funcStorageQueueAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageQueueDataContributorRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageQueueDataContributorRoleId
    )
  }
}

// Function App MI → "Storage Table Data Contributor" (AzureWebJobsStorage tables)
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource funcStorageTableAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, storageTableDataContributorRoleId)
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageTableDataContributorRoleId
    )
  }
}

// ── EasyAuth disabled on Function App ─────────────────────────────────────
// Linking a backend to a Static Web App auto-enables EasyAuth on the
// function with the azureStaticWebApps provider. This breaks anonymous
// /api/* calls with: 400 "Login not supported for provider azureStaticWebApps".
// Our /api routes are anonymous and pass through SWA without auth,
// so we explicitly disable EasyAuth after the linked backend is created.
resource functionAuthDisabled 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: false
    }
    globalValidation: {
      requireAuthentication: false
      unauthenticatedClientAction: 'AllowAnonymous'
    }
  }
  dependsOn: [
    linkedBackend
  ]
}

// ── Availability monitoring (optional, gated on alertEmail) ──────────────
// Pings GET /api/health every 5 min from 5 regions. If 3+ regions report
// failure within 5 min, fires the action group and emails alertEmail.
// This is what would have caught the May-2026 storage-network outage in
// minutes instead of hours.
var enableAvailabilityAlert = !empty(alertEmail)

resource alertActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (enableAvailabilityAlert) {
  name: 'ag-${environmentName}-${nameSuffix}'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: take(environmentName, 12)
    enabled: true
    emailReceivers: [
      {
        name: 'primary'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource healthAvailabilityTest 'Microsoft.Insights/webtests@2022-06-15' = if (enableAvailabilityAlert) {
  name: 'avt-${environmentName}-${nameSuffix}-health'
  location: location
  tags: union(tags, {
    // Tag pattern required by App Insights to associate the web test with
    // the AI component (otherwise the test won't show up in the AI blade).
    'hidden-link:${appInsights.id}': 'Resource'
  })
  kind: 'standard'
  properties: {
    SyntheticMonitorId: 'avt-${environmentName}-${nameSuffix}-health'
    Name: '${environmentName} /api/health'
    Description: 'Pings the Function App health endpoint to detect host outages.'
    Enabled: true
    Frequency: 300
    Timeout: 30
    Kind: 'standard'
    RetryEnabled: true
    Locations: [
      { Id: 'us-il-ch1-azr' }
      { Id: 'us-tx-sn1-azr' }
      { Id: 'us-va-ash-azr' }
      { Id: 'emea-nl-ams-azr' }
      { Id: 'apac-jp-kaw-edge' }
    ]
    Request: {
      RequestUrl: 'https://${functionApp.properties.defaultHostName}/api/health'
      HttpVerb: 'GET'
      ParseDependentRequests: false
    }
    ValidationRules: {
      ExpectedHttpStatusCode: 200
      SSLCheck: true
      SSLCertRemainingLifetimeCheck: 7
    }
  }
}

resource healthAvailabilityAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (enableAvailabilityAlert) {
  name: 'alert-${environmentName}-${nameSuffix}-health'
  location: 'global'
  tags: tags
  properties: {
    description: 'Function App /api/health is failing from multiple regions.'
    severity: 1
    enabled: true
    scopes: [
      healthAvailabilityTest.id
      appInsights.id
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria'
      webTestId: healthAvailabilityTest.id
      componentId: appInsights.id
      // 3 of 5 regions failing in a 5-min window.
      failedLocationCount: 3
    }
    actions: [
      {
        actionGroupId: alertActionGroup.id
      }
    ]
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────
output AZURE_LOCATION string = location
output WEB_URL string = 'https://${staticWebApp.properties.defaultHostname}'
output WEB_NAME string = staticWebApp.name
output API_NAME string = functionApp.name
output API_URL string = 'https://${functionApp.properties.defaultHostName}'
output AOAI_ENDPOINT string = openAi.properties.endpoint
output AOAI_DEPLOYMENT string = openAiDeploymentName
output AOAI_DEPLOYMENT_FALLBACK string = openAiFallbackDeploymentName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = appInsights.properties.ConnectionString
