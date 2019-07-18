const { ApolloServer, gql } = require('apollo-server');
const { SchemaDirectiveVisitor } = require('graphql-tools');

const { createError } = require('apollo-errors');

const { ApolloProjector, IncludeAll, IgnoreField, default: makeProjection } = require('graphql-db-projection');

const AuthorizationError = createError('AuthorizationError', {
	message: 'You are not authorized.'
});

const { DirectiveLocation, GraphQLDirective, GraphQLList, GraphQLString, GraphQLNonNull } = require('graphql');


class AuthDirective extends SchemaDirectiveVisitor {
	static getDirectiveDeclaration(directiveName, schema) {
		return new GraphQLDirective({
			name: 'auth',
			locations: [ DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT ],
			args: {
				roles: {
					type: new GraphQLList(new GraphQLNonNull(schema.getType('Role'))),
					defaultValue: 'reader'
				}
			}
		});
	}

	visitFieldDefinition(field, x) {
		const { resolve = defaultFieldResolver } = field;

		field.resolve = async (root, args, context, info) => {
			const allowedRoles = this.args.roles || [];

			const user = await context.getUser();

			if (!user || !user.roles.some((role) => allowedRoles.includes(role))) {
				throw new Error('Unauthorized');
			}

			return resolve.call(this, root, args, context, info);
		};
	}

	visitObject(obj) {
		const fields = obj.getFields();
		const expectedRoles = this.args.roles;

		Object.keys(fields).forEach((fieldName) => {
			const field = fields[fieldName];
			const next = field.resolve;

			this.visitFieldDefinition(field);
		});
	}
}

class ModelDirective extends SchemaDirectiveVisitor {
	static getDirectiveDeclaration(directiveName, schema) {
		return new GraphQLDirective({
			name: 'model',
			locations: [ DirectiveLocation.FIELD_DEFINITION ],
			args: {
				table: {
					type: GraphQLString,
					defaultValue: null
				}
			}
		});
	}

	visitFieldDefinition(field) {
		for (const [ name, subfield ] of Object.entries(field.type.ofType._fields)) {
			field.args.push({
				name,
				description: '',
				type: subfield.type instanceof GraphQLNonNull ? subfield.type.ofType : subfield.type,
				defaultValue: undefined
			});
		}
		const { resolve = defaultFieldResolver } = field;

		field.resolve = async (root, args, context, info) => {
			const { table } = this.args;

			const projection = makeProjection(info);

			debugger;

			return resolve.call(this, root, args, context, info);
		};
	}
}
// The GraphQL schema
const typeDefs = gql`
	enum Role {
		ADMIN
		USER
	}

	type Hero {
		name: String!
	}

	directive @auth(roles: [Role!]) on FIELD_DEFINITION | OBJECT

	directive @model(table: String!) on FIELD_DEFINITION

	directive @project(projection: String, projections: [String], nameInDB: String) on FIELD_DEFINITION

	directive @all on FIELD_DEFINITION

	directive @ignore on FIELD_DEFINITION

	type Query {
		heroes(x: Int): [Hero] @model(table: "hero")
	}
`;

// A map of functions which return data for the schema.
const resolvers = {
	Query: {
		heroes: () => 'world'
	}
};

const server = new ApolloServer({
	typeDefs,
	resolvers,
	schemaDirectives: {
		project: ApolloProjector,
		all: IncludeAll,
		ignore: IgnoreField,
		auth: AuthDirective,
		model: ModelDirective
	}
});

server.listen().then(({ url }) => {
	console.log(`🚀 Server ready at ${url}`);
});
