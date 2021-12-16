/****************************************************************************
 * Copyright 2021 EPAM Systems
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ***************************************************************************/

import {
  Action,
  Atom,
  Bond,
  fromAtomAddition,
  fromAtomsAttrs,
  fromBondAddition,
  fromFragmentDeletion,
  fromSgroupDeletion,
  FunctionalGroup,
  SGroup
} from 'ketcher-core'

import utils from '../shared/utils'
import Editor from '../Editor'

class AtomTool {
  editor: Editor
  atomProps: any
  bondProps: any
  dragCtx: any

  constructor(editor, atomProps) {
    this.editor = editor
    this.atomProps = atomProps
    this.bondProps = { type: 1, stereo: Bond.PATTERN.STEREO.NONE }
  }

  mousedown(event) {
    const struct = this.editor.render.ctab
    const molecule = struct.molecule
    const functionalGroups = molecule.functionalGroups
    const sgroups = struct.sgroups
    this.editor.hover(null)
    this.editor.selection(null)
    const ci = this.editor.findItem(event, ['atoms', 'functionalGroups'], null)
    if (
      ci &&
      ci.map === 'functionalGroups' &&
      functionalGroups &&
      FunctionalGroup.isContractedFunctionalGroup(ci.id, functionalGroups)
    ) {
      const action = new Action()
      const selectedSgroup = sgroups.get(ci.id)
      const sGroupAtoms = SGroup.getAtoms(molecule, selectedSgroup?.item)
      const [firstAtom, ...atoms] = sGroupAtoms
      const atomNeighbours = struct.molecule.atomGetNeighbors(firstAtom)
      const extraNeighbour = atomNeighbours?.some(
        atom => !sGroupAtoms.includes(atom.aid)
      )
      if (extraNeighbour) {
        action.mergeWith(fromSgroupDeletion(struct, ci.id))
        action.mergeWith(fromFragmentDeletion(struct, { atoms: atoms }))
        action.mergeWith(
          fromAtomsAttrs(struct, firstAtom, this.atomProps, true)
        )
      } else {
        const firstAtomPp = struct.atoms.get(firstAtom)?.a.pp
        action.mergeWith(
          fromFragmentDeletion(struct, {
            atoms: SGroup.getAtoms(molecule, selectedSgroup?.item),
            bonds: SGroup.getBonds(molecule, selectedSgroup?.item)
          })
        )
        action.mergeWith(fromAtomAddition(struct, firstAtomPp, this.atomProps))
      }
      this.editor.update(action)
    }
    const atomResult: Array<any> = []
    const result: Array<any> = []
    if (ci && functionalGroups.size && ci.map === 'atoms') {
      const atomId = FunctionalGroup.atomsInFunctionalGroup(
        functionalGroups,
        ci.id
      )
      if (atomId !== null) atomResult.push(atomId)
    }
    if (atomResult.length > 0) {
      for (let id of atomResult) {
        const fgId = FunctionalGroup.findFunctionalGroupByAtom(
          functionalGroups,
          id
        )
        if (fgId !== null && !result.includes(fgId)) {
          result.push(fgId)
        }
      }
      this.editor.event.removeFG.dispatch({ fgIds: result })
      return
    }
    if (!ci) {
      // ci.type == 'Canvas'
      this.dragCtx = {}
    } else if (ci.map === 'atoms') {
      this.dragCtx = { item: ci }
    }
  }

  mousemove(event) {
    const rnd = this.editor.render
    if (!this.dragCtx || !this.dragCtx.item) {
      this.editor.hover(
        this.editor.findItem(event, ['atoms', 'functionalGroups'], null)
      )
      return
    }

    const dragCtx = this.dragCtx
    const ci = this.editor.findItem(event, ['atoms'], null)

    if (ci && ci.map === 'atoms' && ci.id === dragCtx.item.id) {
      // fromAtomsAttrs
      this.editor.hover(this.editor.findItem(event, ['atoms'], null))
      return
    }

    // fromAtomAddition
    const atom = rnd.ctab.molecule.atoms.get(dragCtx.item.id)
    let angle = utils.calcAngle(atom?.pp, rnd.page2obj(event))
    if (!event.ctrlKey) angle = utils.fracAngle(angle, null)
    const degrees = utils.degrees(angle)
    this.editor.event.message.dispatch({ info: degrees + 'º' })
    const newAtomPos = utils.calcNewAtomPos(
      atom?.pp,
      rnd.page2obj(event),
      event.ctrlKey
    )
    if (dragCtx.action) dragCtx.action.perform(rnd.ctab)

    dragCtx.action = fromBondAddition(
      rnd.ctab,
      this.bondProps,
      dragCtx.item.id,
      Object.assign({}, this.atomProps),
      newAtomPos,
      newAtomPos
    )[0]
    this.editor.update(dragCtx.action, true)
  }

  mouseup(event) {
    const struct = this.editor.render.ctab
    const molecule = struct.molecule
    const functionalGroups = molecule.functionalGroups
    const ci = this.editor.findItem(event, ['atoms', 'bonds'], null)
    const atomResult: Array<any> = []
    const result: Array<any> = []
    if (ci && functionalGroups && ci.map === 'atoms') {
      const atomId = FunctionalGroup.atomsInFunctionalGroup(
        functionalGroups,
        ci.id
      )
      if (atomId !== null) atomResult.push(atomId)
    }
    if (atomResult.length > 0) {
      for (let id of atomResult) {
        const fgId = FunctionalGroup.findFunctionalGroupByAtom(
          functionalGroups,
          id
        )
        if (fgId !== null && !result.includes(fgId)) {
          result.push(fgId)
        }
      }
      this.editor.event.removeFG.dispatch({ fgIds: result })
      return
    }

    if (this.dragCtx) {
      const dragCtx = this.dragCtx
      const rnd = this.editor.render

      this.editor.update(
        dragCtx.action ||
          (dragCtx.item
            ? fromAtomsAttrs(rnd.ctab, dragCtx.item.id, this.atomProps, true)
            : fromAtomAddition(rnd.ctab, rnd.page2obj(event), this.atomProps))
      )

      delete this.dragCtx
    }
    this.editor.event.message.dispatch({
      info: false
    })
  }
}

export function atomLongtapEvent(tool, render) {
  const dragCtx = tool.dragCtx
  const editor = tool.editor

  const atomid = dragCtx.item && dragCtx.item.id

  // edit atom or add atom
  const atom =
    atomid !== undefined && atomid !== null
      ? render.ctab.molecule.atoms.get(atomid)
      : new Atom({ label: '' })

  // TODO: longtab event
  dragCtx.timeout = setTimeout(() => {
    delete tool.dragCtx
    editor.selection(null)
    const res = editor.event.quickEdit.dispatch(atom)
    Promise.resolve(res)
      .then(newatom => {
        const action = atomid
          ? fromAtomsAttrs(render.ctab, atomid, newatom, null)
          : fromAtomAddition(render.ctab, dragCtx.xy0, newatom)
        editor.update(action)
      })
      .catch(() => null) // w/o changes
  }, 750)

  dragCtx.stopTapping = function () {
    if (dragCtx.timeout) {
      clearTimeout(dragCtx.timeout)
      delete dragCtx.timeout
    }
  }
}

export default AtomTool