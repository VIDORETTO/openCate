import {
  dispatchCateInvoke,
  forwardToActiveWindow,
  type InvokeScope,
} from '../extensions/cateApiHandlers'
import { CompanionGateway, CompanionSessionStore } from './companionGateway'
import { CompanionPairingManager } from './pairing'

export interface MainCompanionBoundary {
  gateway: CompanionGateway
  pairing: CompanionPairingManager
}

/** Main-process adapter. A future HTTP/WebSocket/relay listener can call this
 *  gateway without gaining a second capability dispatcher or reusing the
 *  loopback CATE_API bearer endpoint. */
export function createMainCompanionGateway(
  sessions = new CompanionSessionStore(),
): CompanionGateway {
  const forward: InvokeScope['forward'] = (payload) => forwardToActiveWindow(payload)
  return new CompanionGateway({
    forward,
    dispatch: (scope, method, args) => dispatchCateInvoke(scope, method, args),
  }, sessions)
}

/** Construct the authoritative gateway and its pairing/device boundary with a
 * shared session store. Main-process wiring can expose this object to a relay
 * listener without creating a second authorization path. */
export function createMainCompanionBoundary(
  sessions = new CompanionSessionStore(),
): MainCompanionBoundary {
  const gateway = createMainCompanionGateway(sessions)
  return { gateway, pairing: new CompanionPairingManager(gateway) }
}
