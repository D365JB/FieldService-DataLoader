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

@description('AOAI deployment name.')
param openAiDeploymentName string = 'gpt-5-mini'

@description('AOAI model name.')
param openAiModelName string = 'gpt-5-mini'

@description('AOAI model version.')
param openAiModelVersion string = '2025-08-07'

@description('AOAI deployment SKU capacity (TPM in thousands).')
param openAiCapacity int = 100

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
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
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
          name: 'AOAI_API_VERSION'
          value: '2024-10-21'
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: 'https://${staticWebApp.properties.defaultHostname},${extraAllowedOrigins}'
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

// ── Outputs ───────────────────────────────────────────────────────────────
output AZURE_LOCATION string = location
output WEB_URL string = 'https://${staticWebApp.properties.defaultHostname}'
output WEB_NAME string = staticWebApp.name
output API_NAME string = functionApp.name
output API_URL string = 'https://${functionApp.properties.defaultHostName}'
output AOAI_ENDPOINT string = openAi.properties.endpoint
output AOAI_DEPLOYMENT string = openAiDeploymentName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = appInsights.properties.ConnectionString
