import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

export function renderWithRouter(
  ui: ReactNode,
  initialPath = '/',
): { RouterComponent: () => JSX.Element } {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  })
  const specRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/specs/$id',
    component: () => <div>spec stub</div>,
  })
  const specsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/specs',
    component: () => <div>specs list stub</div>,
  })
  const tree = rootRoute.addChildren([indexRoute, specRoute, specsRoute])
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return {
    RouterComponent: () => (
      <RouterProvider router={router as unknown as Parameters<typeof RouterProvider>[0]['router']} />
    ),
  }
}
