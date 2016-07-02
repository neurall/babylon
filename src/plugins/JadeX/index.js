/* eslint indent: 0 */

// 
// JadeX is just one function extending Jsx plugin it internally uses with
//
//  1) indentation driven hierarchy removing end tags so you can now do.
// 
//  var App = <div>
//              <button>
// 
//  Instead of:
//
//  var App = <div>
//              <button>
//              </button>
//            </div>
//
// We delegate all to Jsx plugin because goal is to be well ... Jsx and not introduce new language. 
// Just just wanna make it bit more practical by reducing js code space wasted by end tags noise by half.
// 
// Therefore all the work is and always will be done by Jsx plugin. The only change is that ...
//
//  1) We call our jsxParseIndentedElementAt instead of jsxParseElementAt at each < element start
//  2) We catch and ignore jsxReadToken missing end tag complaint on end of parsing
//

import Parser from "../../parser";
import { types as tt } from "../../tokenizer/types";

export default function(instance) {

  // we need to enable locations so we can decide indentation in jsxParseIndentedElementAt.

  instance.options.locations = true;
  
  // change no 1: on <tag start call our jsxParseIndentedElementAt instead of jsxParseElementAt

  instance.extend("parseExprAtom", function(inner) {
    return function(refShortHandDefaultPos) {
      if (this.match(tt.jsxTagStart)) {
        let startPos = this.state.start, startLoc = this.state.startLoc;
        this.next();
        return this.jsxParseIndentedElementAt(startPos, startLoc);
      } else {
        return inner.call(this, refShortHandDefaultPos);
      }
    };
  });

  // change no 2: we catch and ignore missing end tag complaint on end of source
  
  instance.extend("readToken", function(inner) {
    return function(code) {
      try {
        return inner.call(this, code);
      } catch (e) {
        return this.finishToken(tt.jsxText,"");
      }  
    };

  });
}

let pp = Parser.prototype;

// This is Indented version of jsxParseElementAt adding childs to parent based on Element Indentation

// Parses entire JSX element, including it"s opening tag
// (starting after "<"), attributes, contents and closing tag.

pp.jsxParseIndentedElementAt = function(startPos, startLoc) {

  let node = this.startNodeAt(startPos, startLoc);
  let children = [];
  let openingElement = this.jsxParseOpeningElementAt(startPos, startLoc);

  // In Indented mode. there are no selfclosing or end tags just tags therefore all can have childs

  contents: for (;;) {

    switch (this.state.type) {
      case tt.jsxTagStart:

        // In Indented mode. if we are not indented under last node. 

        if ((this.state.startLoc.line   == openingElement.loc.start.line && !openingElement.selfClosing)
          || this.state.startLoc.column <= openingElement.loc.start.column) {  
            
            // Then leave/backtrace until we find real parent to continue creating childs under

            break contents;
        }       
        startPos = this.state.start; startLoc = this.state.startLoc;
        this.next();

        // In Indented mode we eat but ignore end tags

        if (this.eat(tt.slash)) {
          /* closingElement = */ this.jsxParseClosingElementAt(startPos, startLoc);
          break contents;
        }
        children.push(this.jsxParseIndentedElementAt(startPos, startLoc));
        break;

      case tt.jsxText:
        children.push(this.parseExprAtom());
        break;

      case tt.braceL:
        children.push(this.jsxParseExpressionContainer());
        break;

      default:

        // In Indented mode missing ending tags are not unexpected so continue without error.

        break contents;    
    }
  }

  // In Indented mode we dont need to keep and allocate closingElements anymore 
  // so we mark all nodes as selfClosed to keep Jsx Ast small but valid for consumers

  openingElement.selfClosing = true;
        
  node.openingElement = openingElement;
  node.closingElement = null;
  node.children = children;
  if (this.match(tt.relational) && this.state.value === "<") {
    this.raise(this.state.start, "Adjacent JSX elements must be wrapped in an enclosing tag");
  }
  return this.finishNode(node, "JSXElement");
};

