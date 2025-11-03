# GraphQL Integration Guide - UI Components

This guide documents GraphQL patterns, conventions, and best practices for the ui-components package.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Query Organization](#query-organization)
3. [Mutation Patterns](#mutation-patterns)
4. [Cache Management](#cache-management)
5. [Error Handling](#error-handling)
6. [Subscription Usage](#subscription-usage)
7. [Code Generation](#code-generation)
8. [Testing GraphQL](#testing-graphql)

---

## Architecture Overview

### GraphQL Clients

The application uses multiple GraphQL clients:

1. **Apollo Client** (Primary)
   - Full-featured GraphQL client
   - Advanced caching with InMemoryCache
   - Dev tools integration
   - Located: `src/providers/ApolloProvider.tsx`

2. **URQL** (Alternative/Experimental)
   - Lightweight GraphQL client
   - SSE (Server-Sent Events) support
   - Simpler API for basic queries
   - Located: Uses default configuration

3. **@graphql-sse/client**
   - Server-Sent Events transport
   - Used for real-time subscriptions
   - Alternative to WebSocket

### Federation Architecture

```
┌─────────────────────────────────────────┐
│         UI Application (React)          │
│         Apollo Client + URQL            │
└──────────────────┬──────────────────────┘
                   │
                   ├─ GraphQL Queries/Mutations
                   │
┌──────────────────▼──────────────────────┐
│     Federated GraphQL Gateway           │
│     (Cosmo Router / Apollo Gateway)     │
└──────────────────┬──────────────────────┘
                   │
         ┌─────────┼─────────┬─────────┐
         │         │         │         │
    ┌────▼───┐ ┌──▼───┐ ┌───▼──┐ ┌───▼───┐
    │Claude  │ │ Git  │ │GitHub│ │ Observ│
    │Service │ │Service│ │Service│ │Service│
    └────────┘ └──────┘ └──────┘ └───────┘
```

---

## Query Organization

### File Structure

GraphQL operations are organized by domain in `src/graphql/`:

```
src/graphql/
├── operations.ts              # Core/common operations
├── claude-operations.ts       # Claude AI related
├── claude-session-management.ts
├── claude-streaming.ts
├── claude-prewarm.ts
├── git-operations.ts          # Git operations
├── github-operations.ts       # GitHub API operations
├── federation-operations.ts   # Federation queries
├── observability-operations.ts # Monitoring
└── migration-guide.md         # Migration docs
```

### Naming Conventions

**Queries:** Use `GET_` or `FETCH_` prefix
```typescript
export const GET_PACKAGES = gql`
  query GetPackages {
    packages {
      id
      name
    }
  }
`;

export const FETCH_PACKAGE_DETAILS = gql`
  query FetchPackageDetails($id: ID!) {
    package(id: $id) {
      id
      name
      version
      health
    }
  }
`;
```

**Mutations:** Use verb prefix (`CREATE_`, `UPDATE_`, `DELETE_`, `TRIGGER_`)
```typescript
export const CREATE_SESSION = gql`
  mutation CreateSession($input: SessionInput!) {
    createSession(input: $input) {
      sessionId
      status
    }
  }
`;

export const TRIGGER_BUILD = gql`
  mutation TriggerBuild($packageId: ID!) {
    triggerBuild(packageId: $packageId) {
      buildId
      status
    }
  }
`;
```

**Subscriptions:** Use `SUBSCRIBE_` or `WATCH_` prefix
```typescript
export const SUBSCRIBE_BUILD_STATUS = gql`
  subscription SubscribeBuildStatus($buildId: ID!) {
    buildStatusChanged(buildId: $buildId) {
      buildId
      status
      progress
    }
  }
`;
```

### Query Structure Guidelines

**1. Request Only What You Need**
```typescript
// ❌ Bad: Over-fetching
query GetPackage($id: ID!) {
  package(id: $id) {
    id
    name
    version
    description
    repository
    dependencies
    devDependencies
    scripts
    files
    # ... everything
  }
}

// ✅ Good: Specific fields
query GetPackageBasic($id: ID!) {
  package(id: $id) {
    id
    name
    version
    health
  }
}
```

**2. Use Fragments for Reusable Fields**
```typescript
// Define fragment
const PACKAGE_CORE_FIELDS = gql`
  fragment PackageCoreFields on Package {
    id
    name
    version
    health
  }
`;

// Use in queries
export const GET_PACKAGES = gql`
  ${PACKAGE_CORE_FIELDS}
  query GetPackages {
    packages {
      ...PackageCoreFields
    }
  }
`;

export const GET_PACKAGE_DETAILS = gql`
  ${PACKAGE_CORE_FIELDS}
  query GetPackageDetails($id: ID!) {
    package(id: $id) {
      ...PackageCoreFields
      dependencies
      devDependencies
      scripts
    }
  }
`;
```

**3. Implement Pagination**
```typescript
export const GET_PACKAGES_PAGINATED = gql`
  query GetPackagesPaginated(
    $first: Int = 20
    $after: String
  ) {
    packages(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          name
          health
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
```

---

## Mutation Patterns

### Basic Mutation

```typescript
import { useMutation } from '@tanstack/react-query';
import { useApolloClient } from '@apollo/client';
import { UPDATE_PACKAGE } from '../graphql/operations';

function UpdatePackageButton({ packageId }: { packageId: string }) {
  const client = useApolloClient();

  const mutation = useMutation({
    mutationFn: async (data: PackageUpdate) => {
      const result = await client.mutate({
        mutation: UPDATE_PACKAGE,
        variables: {
          id: packageId,
          input: data
        }
      });
      return result.data;
    },
    onSuccess: (data) => {
      console.log('Package updated:', data);
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
    onError: (error) => {
      console.error('Update failed:', error);
      // Show error toast
    }
  });

  return (
    <button
      onClick={() => mutation.mutate({ name: 'New Name' })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Updating...' : 'Update Package'}
    </button>
  );
}
```

### Optimistic Updates

```typescript
const mutation = useMutation({
  mutationFn: async (like: { packageId: string }) => {
    return await client.mutate({
      mutation: LIKE_PACKAGE,
      variables: like,
      // Optimistic response
      optimisticResponse: {
        likePackage: {
          __typename: 'Package',
          id: like.packageId,
          likes: (currentLikes) => currentLikes + 1
        }
      },
      // Update cache immediately
      update: (cache, { data }) => {
        cache.modify({
          id: cache.identify({ __typename: 'Package', id: like.packageId }),
          fields: {
            likes: () => data.likePackage.likes
          }
        });
      }
    });
  }
});
```

### Batch Mutations

```typescript
async function batchUpdatePackages(packageIds: string[], update: PackageUpdate) {
  const mutations = packageIds.map(id =>
    client.mutate({
      mutation: UPDATE_PACKAGE,
      variables: { id, input: update }
    })
  );

  // Execute all mutations in parallel
  const results = await Promise.allSettled(mutations);

  // Handle results
  const successful = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  return {
    successful: successful.length,
    failed: failed.length,
    errors: failed.map(f => f.reason)
  };
}
```

---

## Cache Management

### Apollo Cache Configuration

```typescript
// src/providers/ApolloProvider.tsx
import { InMemoryCache, ApolloClient } from '@apollo/client';

const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        packages: {
          // Merge arrays by ID
          keyArgs: false,
          merge(existing = [], incoming) {
            return [...existing, ...incoming];
          }
        }
      }
    },
    Package: {
      keyFields: ['id'],
      fields: {
        health: {
          // Always use incoming value
          merge(_, incoming) {
            return incoming;
          }
        },
        dependencies: {
          // Merge dependency arrays
          merge(existing = [], incoming) {
            const merged = [...existing];
            incoming.forEach(dep => {
              if (!merged.find(m => m.name === dep.name)) {
                merged.push(dep);
              }
            });
            return merged;
          }
        }
      }
    },
    BuildStatus: {
      keyFields: ['buildId']
    }
  }
});

const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  cache,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all'
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all'
    },
    mutate: {
      errorPolicy: 'all'
    }
  }
});
```

### Cache Invalidation Strategies

**1. Manual Invalidation (TanStack Query)**
```typescript
// After mutation
queryClient.invalidateQueries({ queryKey: ['packages'] });

// Invalidate specific item
queryClient.invalidateQueries({
  queryKey: ['package', packageId]
});

// Invalidate multiple related queries
queryClient.invalidateQueries({
  predicate: (query) =>
    query.queryKey[0] === 'packages' ||
    query.queryKey[0] === 'package'
});
```

**2. Cache Eviction (Apollo)**
```typescript
// Remove from cache
cache.evict({
  id: cache.identify({ __typename: 'Package', id: packageId })
});
cache.gc(); // Garbage collect

// Remove specific field
cache.modify({
  id: cache.identify({ __typename: 'Package', id: packageId }),
  fields: {
    dependencies: (_, { DELETE }) => DELETE
  }
});
```

**3. Refetch Queries**
```typescript
await client.refetchQueries({
  include: ['GetPackages', 'GetPackageDetails']
});

// Or with mutation
await client.mutate({
  mutation: UPDATE_PACKAGE,
  variables: { id, input },
  refetchQueries: [
    { query: GET_PACKAGES },
    { query: GET_PACKAGE_DETAILS, variables: { id } }
  ]
});
```

### Cache Persistence

```typescript
// Optional: Persist cache to localStorage
import { persistCache, LocalStorageWrapper } from 'apollo3-cache-persist';

await persistCache({
  cache,
  storage: new LocalStorageWrapper(window.localStorage),
  maxSize: 1048576, // 1MB
  debug: import.meta.env.DEV
});
```

---

## Error Handling

### Centralized Error Handler

```typescript
// src/utils/graphql-error-handler.ts
import { ApolloError } from '@apollo/client';

export interface GraphQLErrorDetails {
  message: string;
  type: 'network' | 'graphql' | 'unknown';
  statusCode?: number;
  path?: string[];
  extensions?: Record<string, any>;
}

export function handleGraphQLError(error: ApolloError): GraphQLErrorDetails {
  // Network errors
  if (error.networkError) {
    const networkError = error.networkError as any;
    return {
      message: networkError.message || 'Network connection failed',
      type: 'network',
      statusCode: networkError.statusCode
    };
  }

  // GraphQL errors
  if (error.graphQLErrors && error.graphQLErrors.length > 0) {
    const firstError = error.graphQLErrors[0];
    return {
      message: firstError.message,
      type: 'graphql',
      path: firstError.path as string[],
      extensions: firstError.extensions
    };
  }

  // Unknown errors
  return {
    message: error.message || 'An unexpected error occurred',
    type: 'unknown'
  };
}
```

### Component-Level Error Handling

```typescript
function PackageList() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['packages'],
    queryFn: fetchPackages
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    const errorDetails = handleGraphQLError(error);

    if (errorDetails.type === 'network') {
      return (
        <ErrorState
          title="Connection Error"
          message="Unable to connect to server. Please check your connection."
          action={<Button onClick={refetch}>Retry</Button>}
        />
      );
    }

    if (errorDetails.type === 'graphql') {
      return (
        <ErrorState
          title="Data Error"
          message={errorDetails.message}
          details={errorDetails.extensions}
        />
      );
    }

    return <ErrorState title="Error" message={errorDetails.message} />;
  }

  return <PackageGrid packages={data} />;
}
```

### Error Recovery

```typescript
const mutation = useMutation({
  mutationFn: updatePackage,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  onError: (error, variables, context) => {
    // Log error
    console.error('Mutation failed:', error);

    // Rollback optimistic update
    if (context?.previousData) {
      queryClient.setQueryData(['package', variables.id], context.previousData);
    }

    // Show user-friendly error
    toast.error(handleGraphQLError(error).message);
  }
});
```

---

## Subscription Usage

### SSE (Server-Sent Events) Pattern

```typescript
import { useEffect, useState } from 'react';

function BuildStatusMonitor({ buildId }: { buildId: string }) {
  const [status, setStatus] = useState<BuildStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `${GRAPHQL_ENDPOINT}?query=${encodeURIComponent(`
        subscription {
          buildStatusChanged(buildId: "${buildId}") {
            buildId
            status
            progress
            logs
          }
        }
      `)}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data.data.buildStatusChanged);
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      setError('Connection lost');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [buildId]);

  if (error) return <div>Error: {error}</div>;
  if (!status) return <div>Connecting...</div>;

  return (
    <div>
      <div>Status: {status.status}</div>
      <ProgressBar value={status.progress} />
      <pre>{status.logs}</pre>
    </div>
  );
}
```

### WebSocket Pattern (Alternative)

```typescript
import { useSubscription } from '@apollo/client';

function BuildStatusMonitor({ buildId }: { buildId: string }) {
  const { data, loading, error } = useSubscription(
    SUBSCRIBE_BUILD_STATUS,
    {
      variables: { buildId },
      onData: ({ data }) => {
        console.log('Build update:', data.data);
      },
      onError: (error) => {
        console.error('Subscription error:', error);
      }
    }
  );

  if (loading) return <div>Connecting...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const status = data?.buildStatusChanged;

  return (
    <div>
      <div>Status: {status.status}</div>
      <ProgressBar value={status.progress} />
    </div>
  );
}
```

---

## Code Generation

### GraphQL Code Generator Setup

**Configuration** (`codegen.yml`):
```yaml
overwrite: true
schema: "http://localhost:4000/graphql"
documents: "src/graphql/**/*.ts"
generates:
  src/generated/graphql-types.ts:
    plugins:
      - "typescript"
      - "typescript-operations"
      - "typescript-react-apollo"
    config:
      withHooks: true
      withComponent: false
      withHOC: false
```

### Running Code Generation

```bash
# Generate types once
npm run codegen

# Watch mode (regenerate on schema changes)
npm run codegen:watch
```

### Using Generated Types

```typescript
// Generated hooks are automatically typed
import { useGetPackagesQuery } from '../generated/graphql-types';

function PackageList() {
  // data, loading, error are all fully typed
  const { data, loading, error } = useGetPackagesQuery();

  // data.packages is typed as Package[]
  return data?.packages.map(pkg => (
    <div key={pkg.id}>{pkg.name}</div>
  ));
}

// Generated types for manual queries
import { GetPackagesQuery, GetPackagesQueryVariables } from '../generated/graphql-types';

const result = await client.query<GetPackagesQuery, GetPackagesQueryVariables>({
  query: GET_PACKAGES
});
```

---

## Testing GraphQL

### Mock Provider

```typescript
import { MockedProvider } from '@apollo/client/testing';

const mocks = [
  {
    request: {
      query: GET_PACKAGES,
      variables: {}
    },
    result: {
      data: {
        packages: [
          { id: '1', name: 'logger', health: 95 },
          { id: '2', name: 'cache', health: 65 }
        ]
      }
    }
  }
];

describe('PackageList', () => {
  it('renders packages', async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <PackageList />
      </MockedProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('logger')).toBeInTheDocument();
      expect(screen.getByText('cache')).toBeInTheDocument();
    });
  });
});
```

### Testing Mutations

```typescript
const updateMock = {
  request: {
    mutation: UPDATE_PACKAGE,
    variables: { id: '1', input: { name: 'Updated' } }
  },
  result: {
    data: {
      updatePackage: {
        id: '1',
        name: 'Updated'
      }
    }
  }
};

it('updates package name', async () => {
  render(
    <MockedProvider mocks={[updateMock]} addTypename={false}>
      <UpdatePackageForm packageId="1" />
    </MockedProvider>
  );

  const input = screen.getByLabelText('Package Name');
  await userEvent.type(input, 'Updated');

  const submitButton = screen.getByText('Save');
  await userEvent.click(submitButton);

  await waitFor(() => {
    expect(screen.getByText('Package updated successfully')).toBeInTheDocument();
  });
});
```

### Testing Errors

```typescript
const errorMock = {
  request: {
    query: GET_PACKAGES
  },
  error: new Error('Network error')
};

it('handles network errors', async () => {
  render(
    <MockedProvider mocks={[errorMock]} addTypename={false}>
      <PackageList />
    </MockedProvider>
  );

  await waitFor(() => {
    expect(screen.getByText(/Connection Error/i)).toBeInTheDocument();
  });
});
```

---

## Best Practices

### 1. Query Performance

- **Use field selection**: Only request fields you need
- **Implement pagination**: Don't fetch unbounded lists
- **Use fragments**: Reduce duplication, improve maintainability
- **Leverage caching**: Set appropriate cache policies
- **Batch queries**: Use DataLoader pattern on backend

### 2. Error Handling

- **Centralize error handling**: Use consistent error handler
- **Show user-friendly messages**: Translate technical errors
- **Implement retry logic**: Network requests can be retried
- **Log errors**: Send to monitoring service
- **Graceful degradation**: Show cached data when possible

### 3. Cache Management

- **Normalize cache**: Use proper keyFields
- **Invalidate wisely**: Don't over-invalidate
- **Garbage collect**: Remove unused cache entries
- **Monitor cache size**: Prevent memory issues
- **Use optimistic updates**: Better UX for mutations

### 4. Type Safety

- **Always use codegen**: Don't write types manually
- **Run codegen regularly**: Keep types in sync
- **Use generated hooks**: Leverage type-safe hooks
- **Validate at boundaries**: Check runtime data matches types

### 5. Testing

- **Mock all GraphQL**: Use MockedProvider
- **Test error states**: Don't just test happy path
- **Test loading states**: Verify loading indicators
- **Integration tests**: Test with real schema when possible

---

## Common Patterns Cheat Sheet

```typescript
// Query with variables
const { data } = useQuery({
  queryKey: ['package', id],
  queryFn: () => client.query({ query: GET_PACKAGE, variables: { id } })
});

// Mutation with optimistic update
const mutation = useMutation({
  mutationFn: (vars) => client.mutate({ mutation: UPDATE, variables: vars }),
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['items'] });
    const previous = queryClient.getQueryData(['items']);
    queryClient.setQueryData(['items'], old => [...old, newData]);
    return { previous };
  },
  onError: (err, variables, context) => {
    queryClient.setQueryData(['items'], context.previous);
  }
});

// Subscription with cleanup
useEffect(() => {
  const subscription = client.subscribe({ query: SUBSCRIBE }).subscribe({
    next: (data) => setData(data),
    error: (err) => console.error(err)
  });
  return () => subscription.unsubscribe();
}, []);

// Refetch on interval
useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
  refetchInterval: 30000 // 30 seconds
});
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-02
**Maintained By**: metaGOTHIC Team
