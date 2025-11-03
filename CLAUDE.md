# CLAUDE.md - UI Components Package

This file provides guidance to Claude Code when working with the ui-components package.

## Package Identity

**Name**: ui-components
**Purpose**: metaGOTHIC Health Monitoring and CI/CD Control Dashboard - React-based web application for managing the framework
**Status**: Active Development
**Owner**: metaGOTHIC Team
**Created**: January 2025
**Size**: Large (~5000+ lines across components, pages, services)
**Complexity**: High

## Single Responsibility

This package is responsible for:
Providing a comprehensive web-based dashboard for monitoring metaGOTHIC package health, managing CI/CD workflows, reviewing code changes, and controlling Claude AI interactions

This package is NOT responsible for:
- Backend GraphQL server implementation (separate services)
- Business logic execution (delegates to GraphQL services)
- Direct database access
- File system operations (uses GraphQL APIs)
- Package publishing logic (triggers via GraphQL)

## Technical Architecture

### Tech Stack

**Core Framework:**
- React 18.2 with TypeScript
- Vite 5.0 for build and dev server
- React Router 6.21 for routing

**State Management:**
- TanStack Query (React Query) 5.17 for server state
- React Context for global UI state
- Apollo Client 3.13 for GraphQL

**GraphQL Integration:**
- Apollo Client for queries and mutations
- GraphQL Code Generator for type-safe operations
- SSE (Server-Sent Events) via `@graphql-sse/client`
- GraphQL Yoga 5.13 integration
- URQL 4.2 as alternative client

**Styling:**
- Tailwind CSS 3.4 for utility-first styling
- Custom CSS modules
- Lucide React icons
- Recharts 2.10 for data visualization

**Testing:**
- Vitest for unit tests
- React Testing Library for component tests
- JSDOM for DOM simulation
- Coverage via Vitest coverage-v8

### Directory Structure

```
src/
├── components/           # Reusable UI components
│   ├── ui/              # shadcn/ui-style base components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── tabs.tsx
│   │   └── ...
│   └── ...              # Feature-specific components
├── pages/               # Route-level page components
│   ├── ChangeReview.tsx      # Code review interface
│   ├── Config.tsx            # Configuration management
│   ├── Observability.tsx     # Monitoring dashboard
│   ├── ToolsGraphQL.tsx      # GraphQL tools
│   └── ClaudeConsoleStandalone.tsx
├── graphql/             # GraphQL operations and queries
│   ├── operations.ts         # Core GraphQL operations
│   ├── git-operations.ts     # Git-related queries/mutations
│   ├── github-operations.ts  # GitHub API operations
│   ├── claude-operations.ts  # Claude AI operations
│   ├── federation-operations.ts
│   └── ...
├── generated/           # Auto-generated GraphQL types
│   └── graphql-types.ts
├── hooks/               # Custom React hooks
├── services/            # Service layer abstractions
├── providers/           # React context providers
│   ├── GraphQLProvider.tsx
│   └── ApolloProvider.tsx
├── contexts/            # React contexts
│   ├── ThemeContext.tsx
│   ├── TokenValidationContext.tsx
│   └── FullPageSpinnerContext.tsx
├── utils/               # Utility functions
│   ├── graphql-error-handler.ts
│   ├── logger.ts
│   └── cache.ts
├── styles/              # Global styles
├── config/              # App configuration
│   └── features.ts
├── test/                # Test utilities
│   └── setup.ts
├── App.tsx              # Main app component
├── AppWithErrorBoundary.tsx
└── main.tsx             # App entry point
```

### Core Features

#### 1. Change Review Interface (`pages/ChangeReview.tsx`)
- **36,000+ lines** - Comprehensive code review UI
- Diff visualization
- Comment system
- Approval workflows
- Integration with Git operations

#### 2. Observability Dashboard (`pages/Observability.tsx`)
- Real-time monitoring of metaGOTHIC packages
- Health metrics visualization
- Build status tracking
- Performance metrics with Recharts
- Alert management

#### 3. Configuration Management (`pages/Config.tsx`)
- metaGOTHIC framework configuration
- SDLC workflow settings
- Environment management
- Feature flags

#### 4. GraphQL Tools (`pages/ToolsGraphQL.tsx`)
- GraphQL playground integration
- Query debugging
- Schema exploration

#### 5. Claude Console (`pages/ClaudeConsoleStandalone.tsx`)
- Standalone Claude AI interface
- Session management
- Streaming responses

## GraphQL Integration Patterns

### Query Organization

All GraphQL operations are organized by domain in `src/graphql/`:

```typescript
// Core operations (operations.ts)
export const GET_PACKAGES = gql`
  query GetPackages {
    packages {
      id
      name
      version
      health
    }
  }
`;

// Git operations (git-operations.ts)
export const GET_GIT_STATUS = gql`
  query GetGitStatus($repoPath: String!) {
    gitStatus(repoPath: $repoPath) {
      branch
      ahead
      behind
      modified
      staged
    }
  }
`;

// Claude operations (claude-operations.ts)
export const CREATE_CLAUDE_SESSION = gql`
  mutation CreateClaudeSession($input: SessionInput!) {
    createSession(input: $input) {
      sessionId
      status
    }
  }
`;
```

### Type-Safe GraphQL with Code Generation

The package uses GraphQL Code Generator for type safety:

```bash
# Generate TypeScript types from GraphQL schema
npm run codegen

# Watch mode during development
npm run codegen:watch
```

Generated types in `src/generated/graphql-types.ts` provide:
- Type-safe query/mutation hooks
- Input type validation
- Response type inference

### Apollo Client Configuration

**Cache Management:**
```typescript
// utils/cache.ts
const cache = new InMemoryCache({
  typePolicies: {
    Package: {
      keyFields: ['id'],
      fields: {
        health: {
          merge(existing, incoming) {
            return incoming;
          }
        }
      }
    }
  }
});
```

**Error Handling:**
```typescript
// utils/graphql-error-handler.ts
export function handleGraphQLError(error: ApolloError) {
  if (error.networkError) {
    console.error('Network error:', error.networkError);
    return 'Network connection failed';
  }

  if (error.graphQLErrors) {
    return error.graphQLErrors
      .map(err => err.message)
      .join(', ');
  }

  return 'An unexpected error occurred';
}
```

### Query Patterns

**Basic Query with TanStack Query:**
```typescript
import { useQuery } from '@tanstack/react-query';
import { useApolloClient } from '@apollo/client';
import { GET_PACKAGES } from '../graphql/operations';

function PackageList() {
  const client = useApolloClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => {
      const result = await client.query({
        query: GET_PACKAGES
      });
      return result.data.packages;
    },
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data?.map(pkg => (
        <PackageCard key={pkg.id} package={pkg} />
      ))}
    </div>
  );
}
```

**Mutation Pattern:**
```typescript
import { useMutation } from '@tanstack/react-query';
import { useApolloClient } from '@apollo/client';
import { TRIGGER_BUILD } from '../graphql/operations';

function BuildTrigger({ packageId }: { packageId: string }) {
  const client = useApolloClient();

  const mutation = useMutation({
    mutationFn: async (variables) => {
      const result = await client.mutate({
        mutation: TRIGGER_BUILD,
        variables
      });
      return result.data;
    },
    onSuccess: () => {
      console.log('Build triggered successfully');
    },
    onError: (error) => {
      console.error('Build trigger failed:', error);
    }
  });

  return (
    <button
      onClick={() => mutation.mutate({ packageId })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Triggering...' : 'Trigger Build'}
    </button>
  );
}
```

**Subscription Pattern (SSE):**
```typescript
import { useEffect, useState } from 'react';
import { GET_BUILD_STATUS_SUBSCRIPTION } from '../graphql/operations';

function BuildStatus({ buildId }: { buildId: string }) {
  const [status, setStatus] = useState<string>('pending');

  useEffect(() => {
    const eventSource = new EventSource(
      `http://localhost:4000/graphql?query=${encodeURIComponent(
        GET_BUILD_STATUS_SUBSCRIPTION
      )}&variables=${encodeURIComponent(JSON.stringify({ buildId }))}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data.buildStatus.status);
    };

    return () => eventSource.close();
  }, [buildId]);

  return <div>Build Status: {status}</div>;
}
```

## State Management Patterns

### React Context for Global UI State

**ThemeContext** (`src/context/ThemeContext.tsx`):
```typescript
import { createContext, useContext, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div className={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
```

**FullPageSpinnerContext** - Loading state management
**TokenValidationContext** - Authentication state

### TanStack Query for Server State

- Query caching with automatic background refetching
- Mutation state management
- Optimistic updates
- Query invalidation on mutations

## Component Architecture

### shadcn/ui-style Base Components

Located in `src/components/ui/`, these are:
- **Headless** - Logic separated from styling
- **Accessible** - ARIA attributes built-in
- **Customizable** - Tailwind-based styling
- **Composable** - Can be combined

Example components:
- `Button` - Variants: default, destructive, outline, ghost, link
- `Card` - Container with header, content, footer
- `Tabs` - Tab interface with keyboard navigation
- `Badge` - Status indicators
- `Label`, `Input`, `Textarea` - Form elements
- `Switch` - Toggle controls
- `Separator` - Visual dividers

### Feature Components

Higher-level components for specific features:
- Package health cards
- Build status indicators
- Git diff viewers
- Claude session managers
- Configuration forms

## Styling Approach

### Tailwind CSS

**Configuration** (`tailwind.config.js`):
- Custom color palette for dark mode
- Typography plugin
- Custom animations
- Component classes

**Usage Patterns:**
```typescript
// Utility-first approach
<div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg">
  <span className="text-sm font-medium text-gray-300">Status:</span>
  <Badge variant="success">Healthy</Badge>
</div>

// Responsive design
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {packages.map(pkg => <PackageCard key={pkg.id} package={pkg} />)}
</div>

// Dark mode with class strategy
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
  Content adapts to theme
</div>
```

### CSS Modules (when needed)

For complex component-specific styles:
```typescript
import styles from './Component.module.css';

function Component() {
  return <div className={styles.container}>...</div>;
}
```

## Testing Strategy

### Unit Tests with Vitest

```typescript
// Component.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);

    await userEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

### Testing with GraphQL Mocks

```typescript
import { MockedProvider } from '@apollo/client/testing';
import { GET_PACKAGES } from '../graphql/operations';

const mocks = [
  {
    request: {
      query: GET_PACKAGES
    },
    result: {
      data: {
        packages: [
          { id: '1', name: 'logger', health: 95 }
        ]
      }
    }
  }
];

it('loads and displays packages', async () => {
  render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <PackageList />
    </MockedProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('logger')).toBeInTheDocument();
  });
});
```

### Coverage Goals

- **Target**: 80% overall coverage
- **Critical Paths**: 100% (authentication, mutations)
- **UI Components**: 70% (focus on logic, not styling)
- **Utilities**: 90%
- **Run**: `npm run test:coverage`

## Build and Deployment

### Development

```bash
# Start dev server (UI only)
npm run dev
# Opens http://localhost:5173

# Start with GraphQL services
npm run dev:full
# Starts UI and backend services together

# With verbose logging
npm run dev:full:verbose
```

### Production Build

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
# Output in dist/

# Preview production build
npm run preview
```

### Environment Variables

```bash
# .env.local (not committed)
VITE_GRAPHQL_ENDPOINT=http://localhost:4000/graphql
VITE_GRAPHQL_WS_ENDPOINT=ws://localhost:4000/graphql
VITE_ENABLE_DEVTOOLS=true
```

## Known Issues

### Issue #1: ThemeContext Import Error

**Status**: DOCUMENTED (High Priority)
**Description**: Tools page crashes due to missing ThemeContext in some components
**Error**: `Cannot find module 'ThemeContext'` or undefined context
**Location**: `src/context/ThemeContext.tsx` exists but not properly imported

**Temporary Workaround**:
- ThemeContext is defined in `src/context/ThemeContext.tsx`
- Ensure all imports use correct path: `import { useTheme } from '../context/ThemeContext'`
- Wrap app in ThemeProvider in main.tsx

**Proper Fix Needed**:
- Audit all ThemeContext imports across codebase
- Ensure ThemeProvider wraps entire app
- Add tests for ThemeContext
- Document theme switching behavior

## Development Patterns

### Adding a New Page

1. Create page component in `src/pages/NewPage.tsx`
2. Add route in `App.tsx`:
```typescript
<Route path="/new-page" element={<NewPage />} />
```
3. Add navigation link in sidebar/nav
4. Create GraphQL operations in `src/graphql/new-operations.ts`
5. Generate types: `npm run codegen`
6. Add tests in `src/pages/NewPage.test.tsx`

### Adding a GraphQL Operation

1. Define operation in appropriate file:
```typescript
// src/graphql/new-operations.ts
export const NEW_QUERY = gql`
  query NewQuery($id: ID!) {
    newData(id: $id) {
      field1
      field2
    }
  }
`;
```
2. Run codegen: `npm run codegen`
3. Use generated types:
```typescript
import { useNewQueryQuery } from '../generated/graphql-types';

function Component() {
  const { data } = useNewQueryQuery({ variables: { id: '123' } });
  // data is fully typed
}
```

### Creating a Reusable Component

1. Add to `src/components/ui/` for base components
2. Add to `src/components/` for feature components
3. Export from `src/components/ui/index.ts`
4. Document props with TypeScript:
```typescript
interface ButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export function Button({ variant = 'default', ...props }: ButtonProps) {
  // Implementation
}
```

## Performance Considerations

### Code Splitting

```typescript
// Lazy load heavy pages
const ChangeReview = lazy(() => import('./pages/ChangeReview'));

// In routes
<Route path="/review" element={
  <Suspense fallback={<LoadingSpinner />}>
    <ChangeReview />
  </Suspense>
} />
```

### Query Optimization

- Use `refetchInterval` judiciously
- Implement pagination for large lists
- Use field selection to request only needed data
- Leverage Apollo cache policies

### Bundle Size

- Current bundle size: ~500KB (gzipped)
- Tree-shaking enabled via Vite
- Dynamic imports for large dependencies
- Monitor with `npm run build -- --analyze`

## Integration with Backend Services

### GraphQL Federation

The UI connects to a federated GraphQL gateway that combines:
- Claude Service (AI operations)
- Git Service (repository operations)
- GitHub Service (GitHub API proxy)
- Observability Service (metrics and monitoring)

### Service Health Monitoring

UI polls service health and adapts:
```typescript
const { data: health } = useQuery({
  queryKey: ['service-health'],
  queryFn: fetchServiceHealth,
  refetchInterval: 10000 // 10 seconds
});

if (health?.claudeService === 'down') {
  // Disable Claude features
  // Show maintenance message
}
```

## Security Considerations

- **No Secrets in Code**: All tokens in environment variables
- **CSRF Protection**: GraphQL mutations use tokens
- **Input Validation**: All user inputs sanitized
- **XSS Prevention**: React's built-in escaping
- **Authentication**: Token-based auth with TokenValidationContext

## Future Enhancements

1. **Real-time Collaboration**: Multiple users viewing same dashboard
2. **Advanced Filtering**: Complex package queries
3. **Custom Dashboards**: User-configurable layouts
4. **Mobile Support**: Responsive design for tablets/phones
5. **Offline Mode**: Service worker for offline viewing
6. **Export/Import**: Configuration backup and restore
7. **Accessibility**: WCAG 2.1 AA compliance
8. **Analytics**: User behavior tracking
9. **Notifications**: Browser notifications for alerts
10. **CLI Integration**: Trigger dashboard from command line

## Troubleshooting

### Issue: GraphQL Connection Failed
- Check backend services are running: `npm run dev:full`
- Verify `VITE_GRAPHQL_ENDPOINT` is correct
- Check network tab for CORS errors

### Issue: Types Out of Sync
- Run `npm run codegen` to regenerate types
- Check GraphQL schema hasn't changed
- Clear cache: `rm -rf node_modules/.vite`

### Issue: Styles Not Applying
- Restart Vite dev server
- Check Tailwind config
- Verify PostCSS is configured
- Clear browser cache

---

**Package Size**: ~5000+ lines across files
**Test Coverage**: Minimal (need to expand to 80%)
**Health Score**: 75/100 (YELLOW - needs CLAUDE.md, more tests, fix ThemeContext)

**Priority Actions:**
1. Fix ThemeContext issue on Tools page
2. Expand test coverage to 80%
3. Document all GraphQL operations
4. Add performance monitoring
5. Improve error handling
