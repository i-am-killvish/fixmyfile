function greet(name: string) {
    console.log(name);
}
greet("text"); // missing args
let num: number = 123; // type mismatch
// unknownFunction(); // undefined symbol
const users: (User | undefined)[] = [
    { name: "John" },
    undefined,
];
const validUsers = users.filter((x): x is NonNullable<typeof x> => Boolean(x));
validUsers.map((u) => u.name);
type User = {
    name: string;
};
declare const user: User | undefined;
console.log(user?.name);
