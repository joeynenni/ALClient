import createGraph, { Graph, Link, Node } from "ngraph.graph"
import path from "ngraph.path"
import { IPosition } from "./definitions/adventureland"
import { DoorInfo, GData, MapName } from "./definitions/adventureland-data"
import { Grids, Grid, LinkData, NodeData } from "./definitions/pathfinder"
import { Constants } from "./Constants"
import { Tools } from "./Tools"

const UNKNOWN = 1
const UNWALKABLE = 2
const WALKABLE = 3

export class Pathfinder {
    protected static G: GData

    protected static FIRST_MAP: MapName = "main"
    protected static TRANSPORT_COST = 50
    protected static TOWN_COST = 450

    protected static grids: Grids = {}
    protected static graph: Graph<NodeData, LinkData> = createGraph({ multigraph: true })
    protected static pathWithoutTown = path.nba(Pathfinder.graph, {
        distance(fromNode, toNode, link) {
            if (link.data && (link.data.type == "leave" || link.data.type == "transport")) {
                // We are using the transporter
                return Pathfinder.TRANSPORT_COST
            } else if (link.data && link.data.type == "town") {
                // We are warping to town
                return 999999
            }
            // We are walking
            if (fromNode.data.map == toNode.data.map) {
                return Tools.distance(fromNode.data, toNode.data)
            }
        },
        oriented: true
    })
    protected static pathWithTown = path.nba(Pathfinder.graph, {
        distance(fromNode, toNode, link) {
            if (link.data && (link.data.type == "leave" || link.data.type == "transport")) {
                // We are using the transporter
                return Pathfinder.TRANSPORT_COST
            } else if (link.data && link.data.type == "town") {
                // We are warping to town
                return Pathfinder.TOWN_COST
            }
            // We are walking
            if (fromNode.data.map == toNode.data.map) {
                return Tools.distance(fromNode.data, toNode.data)
            }
        },
        oriented: true
    })

    /**
     * Calculates the distance to a door. Used for optimizing movements to doors
     * @param a The position to check the distance to the door
     * @param b The door's information (G.maps[mapName].doors[doorNum])
     */
    public static doorDistance(a: { x: number, y: number, map?: MapName }, b: DoorInfo): number {
        const doorX = b[0]
        const doorY = b[1]
        const doorWidth = b[2]
        const doorHeight = b[3]
        let closest = Number.MAX_VALUE
        for (const x of [doorX - doorWidth / 2, doorX + doorWidth / 2]) {
            for (const y of [doorY - doorHeight / 2, doorY + doorHeight / 2]) {
                const distance = Tools.distance(a, { x: x, y: y })
                if (distance < closest) closest = distance
            }
        }
        return closest
    }

    protected static addLinkToGraph(from: Node<NodeData>, to: Node<NodeData>, data?: LinkData): Link<LinkData> {
        return this.graph.addLink(from.id, to.id, data)
    }

    protected static addNodeToGraph(map: MapName, x: number, y: number): Node<NodeData> {
        return this.graph.addNode(`${map}:${x},${y}`, { map: map, x: x, y: y })
    }

    /**
     * Checks if we can stand at the given location. Useful for `blink()`.
     *
     * @static
     * @param {IPosition} location Position to check if we can stand there
     * @return {*}  {boolean}
     * @memberof Pathfinder
     */
    public static canStand(location: IPosition): boolean {
        if (!this.G) throw new Error("Prepare pathfinding before querying canStand()!")

        const y = Math.trunc(location.y) - this.G.geometry[location.map].min_y
        const x = Math.trunc(location.x) - this.G.geometry[location.map].min_x
        const width = this.G.geometry[location.map].max_x - this.G.geometry[location.map].min_x

        try {
            const grid = this.getGrid(location.map)
            if (grid[y * width + x] == WALKABLE) return true
        } catch (e) {
            return false
        }

        return false
    }

    /**
     * Checks if we can walk from `from` to `to`. Useful for `move()`.
     * Adapted from http://eugen.dedu.free.fr/projects/bresenham/
     * @param from The starting position (where we start walking from)
     * @param to The ending position (where we walk to)
     */
    public static canWalkPath(from: IPosition, to: IPosition): boolean {
        if (!this.G) throw new Error("Prepare pathfinding before querying canWalkPath()!")
        if (from.map !== to.map) return false // We can't walk across maps

        const grid = this.getGrid(from.map)
        const width = this.G.geometry[from.map].max_x - this.G.geometry[from.map].min_x

        let xstep, ystep // the step on y and x axis
        let error // the error accumulated during the incremenet
        let errorprev // *vision the previous value of the error variable
        let x = Math.trunc(from.x) - this.G.geometry[from.map].min_x, y = Math.trunc(from.y) - this.G.geometry[from.map].min_y // the line points
        let dx = Math.trunc(to.x) - Math.trunc(from.x)
        let dy = Math.trunc(to.y) - Math.trunc(from.y)

        if (grid[y * width + x] !== WALKABLE) return false

        if (dy < 0) {
            ystep = -1
            dy = -dy
        } else {
            ystep = 1
        }
        if (dx < 0) {
            xstep = -1
            dx = -dx
        } else {
            xstep = 1
        }
        const ddy = 2 * dy
        const ddx = 2 * dx

        if (ddx >= ddy) { // first octant (0 <= slope <= 1)
            // compulsory initialization (even for errorprev, needed when dx==dy)
            errorprev = error = dx // start in the middle of the square
            for (let i = 0; i < dx; i++) { // do not use the first point (already done)
                x += xstep
                error += ddy
                if (error > ddx) { // increment y if AFTER the middle ( > )
                    y += ystep
                    error -= ddx
                    // three cases (octant == right->right-top for directions below):
                    if (error + errorprev < ddx) { // bottom square also
                        if (grid[(y - ystep) * width + x] !== WALKABLE) return false
                    } else if (error + errorprev > ddx) { // left square also
                        if (grid[y * width + x - xstep] !== WALKABLE) return false
                    } else { // corner: bottom and left squares also
                        if (grid[(y - ystep) * width + x] !== WALKABLE) return false
                        if (grid[y * width + x - xstep] !== WALKABLE) return false
                    }
                }
                if (grid[y * width + x] !== WALKABLE) return false
                errorprev = error
            }
        } else { // the same as above
            errorprev = error = dy
            for (let i = 0; i < dy; i++) {
                y += ystep
                error += ddx
                if (error > ddy) {
                    x += xstep
                    error -= ddy
                    if (error + errorprev < ddy) {
                        if (grid[y * width + x - xstep] !== WALKABLE) return false
                    } else if (error + errorprev > ddy) {
                        if (grid[(y - ystep) * width + x] !== WALKABLE) return false
                    } else {
                        if (grid[y * width + x - xstep] !== WALKABLE) return false
                        if (grid[(y - ystep) * width + x] !== WALKABLE) return false
                    }
                }
                if (grid[y * width + x] !== WALKABLE) return false
                errorprev = error
            }
        }

        return true
    }

    public static computePathCost(path: LinkData[]): number {
        let cost = 0
        let current: LinkData = path[0]
        for (let i = 1; i < path.length; i++) {
            const next = path[i]
            if (next.type == "move") {
                cost += Tools.distance(current, next)
            } else if (next.type == "leave" || next.type == "transport") {
                cost += this.TRANSPORT_COST
            } else if (next.type == "town") {
                cost += this.TOWN_COST
            }

            current = next
        }
        return cost
    }

    /**
     * Generates a grid of walkable pixels that we use for pathfinding.
     * @param map The map to generate the grid for
     */
    public static getGrid(map: MapName): Grid {
        // Return the grid we've prepared if we have it.
        if (this.grids[map]) return this.grids[map]
        if (!this.G) throw new Error("Prepare pathfinding before querying getGrid()!")

        console.debug(`Preparing ${map}...`)

        const width = this.G.geometry[map].max_x - this.G.geometry[map].min_x
        const height = this.G.geometry[map].max_y - this.G.geometry[map].min_y

        const grid = new Uint8Array(height * width)
        grid.fill(UNKNOWN)

        // Make the y_lines unwalkable
        for (const yLine of this.G.geometry[map].y_lines) {
            for (let y = Math.max(0, yLine[0] - this.G.geometry[map].min_y - Constants.BASE.vn); y <= yLine[0] - this.G.geometry[map].min_y + Constants.BASE.v && y < height; y++) {
                for (let x = Math.max(0, yLine[1] - this.G.geometry[map].min_x - Constants.BASE.h); x <= yLine[2] - this.G.geometry[map].min_x + Constants.BASE.h && x < width; x++) {
                    grid[y * width + x] = UNWALKABLE
                }
            }
        }

        // Make the x_lines unwalkable
        for (const xLine of this.G.geometry[map].x_lines) {
            for (let x = Math.max(0, xLine[0] - this.G.geometry[map].min_x - Constants.BASE.h); x <= xLine[0] - this.G.geometry[map].min_x + Constants.BASE.h && x < width; x++) {
                for (let y = Math.max(0, xLine[1] - this.G.geometry[map].min_y - Constants.BASE.vn); y <= xLine[2] - this.G.geometry[map].min_y + Constants.BASE.v && y < height; y++) {
                    grid[y * width + x] = UNWALKABLE
                }
            }
        }

        // Fill in the grid with walkable pixels
        for (const spawn of this.G.maps[map].spawns) {
            let x = Math.trunc(spawn[0]) - this.G.geometry[map].min_x
            let y = Math.trunc(spawn[1]) - this.G.geometry[map].min_y
            if (grid[y * width + x] === WALKABLE) continue // We've already flood filled this
            const stack = [[y, x]]
            while (stack.length) {
                [y, x] = stack.pop()
                let x1 = x
                while (x1 >= 0 && grid[y * width + x1] == UNKNOWN) x1--
                x1++
                let spanAbove = 0
                let spanBelow = 0
                while (x1 < width && grid[y * width + x1] == UNKNOWN) {
                    grid[y * width + x1] = WALKABLE
                    if (!spanAbove && y > 0 && grid[(y - 1) * width + x1] == UNKNOWN) {
                        stack.push([y - 1, x1])
                        spanAbove = 1
                    } else if (spanAbove && y > 0 && grid[(y - 1) * width + x1] !== UNKNOWN) {
                        spanAbove = 0
                    }

                    if (!spanBelow && y < height - 1 && grid[(y + 1) * width + x1] == UNKNOWN) {
                        stack.push([y + 1, x1])
                        spanBelow = 1
                    } else if (spanBelow && y < height - 1 && grid[(y + 1) * width + x1] !== UNKNOWN) {
                        spanBelow = 0
                    }
                    x1++
                }
            }
        }

        // Add to our grids
        this.grids[map] = grid

        const walkableNodes: Node<NodeData>[] = []

        this.graph.beginUpdate()

        // Add nodes at corners
        // console.debug("  Adding corners...")
        // console.debug(`  # nodes: ${walkableNodes.length}`)
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width; x++) {
                if (grid[y * width + x] !== WALKABLE) continue

                if (grid[(y - 1) * width + x - 1] === UNWALKABLE
                    && grid[(y - 1) * width + x] === UNWALKABLE
                    && grid[(y - 1) * width + x + 1] === UNWALKABLE
                    && grid[y * width + x - 1] === UNWALKABLE
                    && grid[(y + 1) * width + x - 1] === UNWALKABLE) {
                    // Inside-1
                    walkableNodes.push(this.addNodeToGraph(map, x + this.G.geometry[map].min_x, y + this.G.geometry[map].min_y))
                } else if (grid[(y - 1) * width + x - 1] === UNWALKABLE
                    && grid[(y - 1) * width + x] === UNWALKABLE
                    && grid[(y - 1) * width + x + 1] === UNWALKABLE
                    && grid[y * width + x + 1] === UNWALKABLE
                    && grid[(y + 1) * width + x + 1] === UNWALKABLE) {
                    // Inside-2
                    walkableNodes.push(this.addNodeToGraph(map, x + this.G.geometry[map].min_x, y + this.G.geometry[map].min_y))
                } else if (grid[(y - 1) * width + x + 1] === UNWALKABLE
                    && grid[y * width + x + 1] === UNWALKABLE
                    && grid[(y + 1) * width + x - 1] === UNWALKABLE
                    && grid[(y + 1) * width + x] === UNWALKABLE
                    && grid[(y + 1) * width + x + 1] === UNWALKABLE) {
                    // Inside-3
                    walkableNodes.push(this.addNodeToGraph(map, x + this.G.geometry[map].min_x, y + this.G.geometry[map].min_y))
                } else if (grid[(y - 1) * width + x - 1] === UNWALKABLE
                    && grid[y * width + x - 1] === UNWALKABLE
                    && grid[(y + 1) * width + x - 1] === UNWALKABLE
                    && grid[(y + 1) * width + x] === UNWALKABLE
                    && grid[(y + 1) * width + x + 1] === UNWALKABLE) {
                    // Inside-4
                    walkableNodes.push(this.addNodeToGraph(map, x + this.G.geometry[map].min_x, y + this.G.geometry[map].min_y))
                } else if (grid[(y - 1) * width + x - 1] === UNWALKABLE
                    && grid[(y - 1) * width + x] === WALKABLE
                    && grid[y * width + x - 1] === WALKABLE) {
                    // Outside-1
                    walkableNodes.push(this.addNodeToGraph(map, x + this.G.geometry[map].min_x, y + this.G.geometry[map].min_y))
                } else if (grid[(y - 1) * width + x] === WALKABLE
                    && grid[(y - 1) * width + x + 1] === UNWALKABLE
                    && grid[y * width + x + 1] === WALKABLE) {
                    // Outside-2
                    walkableNodes.push(this.addNodeToGraph(map, x + this.G.geometry[map].min_x, y + this.G.geometry[map].min_y))
                } else if (grid[y * width + x + 1] === WALKABLE
                    && grid[(y + 1) * width + x] === WALKABLE
                    && grid[(y + 1) * width + x + 1] === UNWALKABLE) {
                    // Outside-3
                    walkableNodes.push(this.addNodeToGraph(map, x + this.G.geometry[map].min_x, y + this.G.geometry[map].min_y))
                } else if (grid[y * width + x - 1] === WALKABLE
                    && grid[(y + 1) * width + x - 1] === UNWALKABLE
                    && grid[(y + 1) * width + x] === WALKABLE) {
                    // Outside-4
                    walkableNodes.push(this.addNodeToGraph(map, x + this.G.geometry[map].min_x, y + this.G.geometry[map].min_y))
                }
            }
        }

        // Add nodes at transporters. We'll look for close nodes to doors later.
        // console.debug("  Adding transporter node and links...")
        // console.debug(`  # nodes: ${walkableNodes.length}`)
        const transporters = []
        for (const npc of this.G.maps[map].npcs) {
            if (npc.id !== "transporter") continue
            const closest = this.findClosestSpawn(map, npc.position[0], npc.position[1])
            const fromNode = this.addNodeToGraph(map, closest.x, closest.y)
            walkableNodes.push(fromNode)
            transporters.push(npc)
        }

        // Add nodes at doors. We'll look for close nodes to doors later.
        // console.debug("  Adding door nodes and links...")
        // console.debug(`  # nodes: ${walkableNodes.length}`)
        const doors: DoorInfo[] = []
        for (const door of this.G.maps[map].doors) {
            // TODO: Figure out how to know if we have access to a locked door
            if (door[7] || door[8]) continue

            // From
            const spawn = this.G.maps[map].spawns[door[6]]
            const fromDoor = this.addNodeToGraph(map, spawn[0], spawn[1])
            walkableNodes.push(fromDoor)
            doors.push(door)
        }

        // Add nodes at spawns
        // console.debug("  Adding spawn nodes...")
        // console.debug(`  # nodes: ${walkableNodes.length}`)
        for (const spawn of this.G.maps[map].spawns) {
            walkableNodes.push(this.addNodeToGraph(map, spawn[0], spawn[1]))
        }

        // TODO: Is there any way to optimize this!?!?
        // TODO: This is what takes the most compute time...
        // console.debug("  Adding walkable links...")
        // console.debug(`  # nodes: ${walkableNodes.length}`)
        for (let i = 0; i < walkableNodes.length; i++) {
            const fromNode = walkableNodes[i]

            // Check if we can walk to another node
            for (let j = i + 1; j < walkableNodes.length; j++) {
                if (this.canWalkPath(fromNode.data, walkableNodes[j].data)) {
                    this.addLinkToGraph(fromNode, walkableNodes[j])
                    this.addLinkToGraph(walkableNodes[j], fromNode)
                }
            }

            // Check if we can reach a door
            for (const door of doors) {
                if (this.doorDistance(walkableNodes[i].data, door) > Constants.DOOR_REACH_DISTANCE) continue // Door is too far away

                // To
                const spawn2 = this.G.maps[door[4]].spawns[door[5]]
                const toDoor = this.addNodeToGraph(door[4], spawn2[0], spawn2[1])
                this.graph.addLink(fromNode.id, toDoor.id, { type: "transport", map: toDoor.data.map, x: toDoor.data.x, y: toDoor.data.y, spawn: door[5] })
            }

            // Add destination nodes and links to maps that are reachable through the transporter
            for (const npc of transporters) {
                if (Tools.distance(fromNode.data, { x: npc.position[0], y: npc.position[1] }) > Constants.TRANSPORTER_REACH_DISTANCE) continue // Transporter is too far away
                for (const toMap in this.G.npcs.transporter.places) {
                    if (map == toMap) continue // Don't add links to ourself

                    const spawnID = this.G.npcs.transporter.places[toMap as MapName]
                    const spawn = this.G.maps[toMap as MapName].spawns[spawnID]
                    const toNode = this.addNodeToGraph(toMap as MapName, spawn[0], spawn[1])

                    this.addLinkToGraph(fromNode, toNode, {
                        type: "transport",
                        map: toMap as MapName,
                        x: toNode.data.x,
                        y: toNode.data.y,
                        spawn: spawnID
                    })
                }
            }
        }

        const townNode = this.addNodeToGraph(map, this.G.maps[map].spawns[0][0], this.G.maps[map].spawns[0][1])
        const townLinkData: LinkData = { type: "town", map: map, x: townNode.data.x, y: townNode.data.y }
        const leaveLink = this.addNodeToGraph("main", this.G.maps.main.spawns[0][0], this.G.maps.main.spawns[0][1])
        const leaveLinkData: LinkData = { type: "leave", map: leaveLink.data.map, x: leaveLink.data.x, y: leaveLink.data.y }
        for (const node of walkableNodes) {
            // Create town links
            if (node.id !== townNode.id) this.addLinkToGraph(node, townNode, townLinkData)

            // Create leave links
            if (map == "cyberland" || map == "jail") this.addLinkToGraph(node, leaveLink, leaveLinkData)
        }

        this.graph.endUpdate()

        return grid
    }

    public static findClosestNode(map: MapName, x: number, y: number): Node<NodeData> {
        let closest: { distance: number, node: Node<NodeData> } = { distance: Number.MAX_VALUE, node: undefined }
        let closestWalkable: { distance: number, node: Node<NodeData> } = { distance: Number.MAX_VALUE, node: undefined }
        const from = { map, x, y }
        this.graph.forEachNode((node) => {
            if (node.data.map == map) {
                const distance = Tools.distance(from, node.data)

                // If we're further than one we can already walk to, don't check further
                if (distance > closest.distance) return

                const walkable = this.canWalkPath(from, node.data)

                if (distance < closest.distance) closest = { distance, node }
                if (walkable && distance < closestWalkable.distance) closestWalkable = { distance, node }
                if (distance < 1) return true
            }
        })

        return closestWalkable.node ? closestWalkable.node : closest.node
    }

    public static findClosestSpawn(map: MapName, x: number, y: number): { map: MapName, x: number, y: number, distance: number } {
        const closest = {
            map: map,
            x: Number.MAX_VALUE,
            y: Number.MAX_VALUE,
            distance: Number.MAX_VALUE
        }
        // Look through all the spawns, and find the closest one
        for (const spawn of this.G.maps[map].spawns) {
            const distance = Tools.distance({ x, y }, { x: spawn[0], y: spawn[1] })
            if (distance < closest.distance) {
                closest.x = spawn[0]
                closest.y = spawn[1]
                closest.distance = distance
            }
        }
        return closest
    }

    public static getPath(from: NodeData, to: NodeData, avoidTownWarps = false): LinkData[] {
        if (!this.G) throw new Error("Prepare pathfinding before querying getPath()!")

        if (from.map == to.map && this.canWalkPath(from, to) && Tools.distance(from, to) < this.TOWN_COST) {
            // Return a straight line to the destination
            return [{ type: "move", map: from.map, x: from.x, y: from.y }, { type: "move", map: from.map, x: to.x, y: to.y }]
        }

        const fromNode = this.findClosestNode(from.map, from.x, from.y)
        const toNode = this.findClosestNode(to.map, to.x, to.y)

        const path: LinkData[] = []

        console.debug(`Looking for a path from ${fromNode.id} to ${toNode.id}...`)
        let rawPath: Node<NodeData>[]
        if (avoidTownWarps) {
            rawPath = this.pathWithoutTown.find(fromNode.id, toNode.id)
        } else {
            rawPath = this.pathWithTown.find(fromNode.id, toNode.id)
        }

        if (rawPath.length == 0) {
            throw new Error("We did not find a path...")
        }
        path.push({ type: "move", map: fromNode.data.map, x: fromNode.data.x, y: fromNode.data.y })
        for (let i = rawPath.length - 1; i > 0; i--) {
            const currentNode = rawPath[i]
            const nextNode = rawPath[i - 1]

            // TODO: Get links, and determine the faster link? This will help solve the walk to spawn issue on winterland.
            const link = this.graph.getLink(currentNode.id, nextNode.id)
            if (link.data) {
                path.push(link.data)
                if (link.data.type == "town") {
                    // Town warps don't always go to the exact location, so sometimes we can't reach the next node.
                    // So... We will walk to the town node after town warping.
                    path.push({ type: "move", map: link.data.map, x: this.G.maps[link.data.map].spawns[0][0], y: this.G.maps[link.data.map].spawns[0][1] })
                }
            } else {
                // If the next move is the town node, check if it's faster to warp there.
                const townNode = this.G.maps[nextNode.data.map].spawns[0]
                if (!avoidTownWarps && nextNode.data.x == townNode[0] && nextNode.data.y == townNode[1]) {
                    if (Tools.distance(currentNode.data, nextNode.data) > this.TOWN_COST) {
                        // It's quicker to use 'town'
                        path.push({ type: "town", map: nextNode.data.map, x: nextNode.data.x, y: nextNode.data.y })
                        path.push({ type: "move", map: nextNode.data.map, x: nextNode.data.x, y: nextNode.data.y })
                    } else {
                        // It's quicker to move
                        path.push({ type: "move", map: nextNode.data.map, x: nextNode.data.x, y: nextNode.data.y })
                    }
                } else {
                    path.push({ map: nextNode.data.map, type: "move", x: nextNode.data.x, y: nextNode.data.y })
                }
            }
        }
        path.push({ type: "move", map: to.map, x: to.x, y: to.y })

        // Clean the path
        for (let i = 0; i < path.length - 1; i++) {
            const current = path[i]
            const next = path[i + 1]

            // If anything is different, continue
            if (current.type !== next.type) continue
            if (current.map !== next.map) continue
            if (current.x !== next.x) continue
            if (current.y !== next.y) continue

            // The two nodes are the same, remove one
            path.splice(i, 1)
        }

        console.debug(`Path from ${fromNode.id} to ${toNode.id} found!`)
        return path
    }

    /**
     * If we were to walk from `from` to `to`, and `to` was unreachable, get the furthest `to` we can walk to.
     * Adapted from http://eugen.dedu.free.fr/projects/bresenham/
     * @param from
     * @param to
     */
    public static getSafeWalkTo(from: IPosition, to: IPosition): IPosition {
        if (from.map !== to.map) throw new Error("We can't walk across maps.")
        if (!this.G) throw new Error("Prepare pathfinding before querying getSafeWalkTo()!")

        const grid = this.getGrid(from.map)
        const width = this.G.geometry[from.map].max_x - this.G.geometry[from.map].min_x

        let xstep, ystep // the step on y and x axis
        let error // the error accumulated during the incremenet
        let errorprev // *vision the previous value of the error variable
        let x = Math.trunc(from.x) - this.G.geometry[from.map].min_x, y = Math.trunc(from.y) - this.G.geometry[from.map].min_y // the line points
        let dx = Math.trunc(to.x) - Math.trunc(from.x)
        let dy = Math.trunc(to.y) - Math.trunc(from.y)

        if (grid[y * width + x] !== WALKABLE) {
            console.error(`We shouldn't be able to be where we are in from (${from.map}:${from.x},${from.y}).`)
            return Pathfinder.findClosestNode(from.map, from.x, from.y).data
        }

        if (dy < 0) {
            ystep = -1
            dy = -dy
        } else {
            ystep = 1
        }
        if (dx < 0) {
            xstep = -1
            dx = -dx
        } else {
            xstep = 1
        }
        const ddy = 2 * dy
        const ddx = 2 * dx

        if (ddx >= ddy) { // first octant (0 <= slope <= 1)
            // compulsory initialization (even for errorprev, needed when dx==dy)
            errorprev = error = dx // start in the middle of the square
            for (let i = 0; i < dx; i++) { // do not use the first point (already done)
                x += xstep
                error += ddy
                if (error > ddx) { // increment y if AFTER the middle ( > )
                    y += ystep
                    error -= ddx
                    // three cases (octant == right->right-top for directions below):
                    if (error + errorprev < ddx) { // bottom square also
                        if (grid[(y - ystep) * width + x] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                    } else if (error + errorprev > ddx) { // left square also
                        if (grid[y * width + x - xstep] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                    } else { // corner: bottom and left squares also
                        if (grid[(y - ystep) * width + x] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                        if (grid[y * width + x - xstep] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                    }
                }
                if (grid[y * width + x] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y + this.G.geometry[from.map].min_y }
                errorprev = error
            }
        } else { // the same as above
            errorprev = error = dy
            for (let i = 0; i < dy; i++) {
                y += ystep
                error += ddx
                if (error > ddy) {
                    x += xstep
                    error -= ddy
                    if (error + errorprev < ddy) {
                        if (grid[y * width + x - xstep] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                    } else if (error + errorprev > ddy) {
                        if (grid[(y - ystep) * width + x] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                    } else {
                        if (grid[y * width + x - xstep] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                        if (grid[(y - ystep) * width + x] !== WALKABLE) return { map: from.map, x: x - xstep + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                    }
                }
                if (grid[y * width + x] !== WALKABLE) return { map: from.map, x: x + this.G.geometry[from.map].min_x, y: y - ystep + this.G.geometry[from.map].min_y }
                errorprev = error
            }
        }

        return to
    }

    public static prepare(g: GData, options: {
        include_bank_b?: boolean,
        include_bank_u?: boolean,
        include_test?: boolean
    } = {}): void {
        if (!g) throw new Error("Please provide GData. You can use Game.getGData().")
        this.G = g

        const maps: MapName[] = [Constants.PATHFINDER_FIRST_MAP]

        console.debug("Preparing pathfinding...")
        const start = Date.now()

        for (let i = 0; i < maps.length; i++) {
            const map = maps[i]

            // Add the connected maps
            for (const door of this.G.maps[map].doors) {
                if (door[4] == "bank_b" && !options.include_bank_b) continue
                if (door[4] == "bank_u" && !options.include_bank_u) continue
                if (door[4] == "test" && !options.include_test) continue // Skip the test map to save ourselves some processing.
                if (!maps.includes(door[4])) maps.push(door[4])
            }
        }

        // Add maps that we can reach through the teleporter
        for (const map in this.G.npcs.transporter.places) {
            if (map == "test" && !options.include_test) continue // Skip the test map to save ourselves some processing.
            if (!maps.includes(map as MapName)) maps.push(map as MapName)
        }

        // Prepare each map
        for (const map of maps) {
            if (map == "test" && !options.include_test) continue // Skip the test map to save ourselves some processing.
            this.getGrid(map)
        }
        this.getGrid("jail") // Jail is disconnected, prepare it

        console.debug(`Pathfinding prepared! (${((Date.now() - start) / 1000).toFixed(3)}s)`)
        console.debug(`  # Nodes: ${this.graph.getNodeCount()}`)
        console.debug(`  # Links: ${this.graph.getLinkCount()}`)
    }
}